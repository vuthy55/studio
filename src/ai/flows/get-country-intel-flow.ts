
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow orchestrates web searches and scraping to gather data,
 * then uses an AI to summarize the verified content.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';
import { getAppSettingsAction } from '@/actions/settings';
import { subDays, parseISO } from 'date-fns';


// --- Source Definitions for Targeted Searches ---

const REGIONAL_NEWS_SITES = [
    'channelnewsasia.com',
    'straitstimes.com',
    'bangkokpost.com',
    'thejakartapost.com',
    'vietnamnews.vn',
    'irrawaddy.com',
    'asean.org',
    'aljazeera.com', // Regional perspective
    'bbc.com/news/world/asia', // Regional perspective
    'reuters.com/world/asia-pacific' // Regional perspective
];

const LOCAL_NEWS_SITES: Record<string, string[]> = {
    'Cambodia': ['phnompenhpost.com', 'khmertimeskh.com', 'cambodianess.com'],
    'Vietnam': ['vnexpress.net', 'tuoitrenews.vn', 'vir.com.vn'],
    'Thailand': ['bangkokpost.com', 'nationthailand.com', 'thaipbsworld.com'],
    'Malaysia': ['thestar.com.my', 'malaysiakini.com', 'freemalaysiatoday.com'],
    'Indonesia': ['thejakartapost.com', 'en.tempo.co', 'antaranews.com'],
    'Philippines': ['rappler.com', 'inquirer.net', 'philstar.com'],
    'Singapore': ['straitstimes.com', 'todayonline.com', 'channelnewsasia.com'],
    'Myanmar': ['irrawaddy.com', 'frontiermyanmar.net'],
    'Laos': ['laotiantimes.com', 'vientianetimes.org.la'],
    'Brunei': ['thebruneian.news', 'borneobulletin.com.bn']
};


// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const IntelItemSchema = z.object({
    summary: z.string().describe('A concise, one-paragraph summary of the key information from the source article that is DIRECTLY relevant to the query and country. Do not summarize the website\'s general purpose.'),
    source: z.string().describe('The URL of the source article.'),
});

const CountryIntelSchema = z.object({
  latestAdvisory: z.array(IntelItemSchema).optional().describe('A list of summaries from official government travel advisories.'),
  scams: z.array(IntelItemSchema).optional().describe('A list of summaries of common tourist scams.'),
  theft: z.array(IntelItemSchema).optional().describe('A list of summaries of theft, robbery, or kidnapping risks.'),
  health: z.array(IntelItemSchema).optional().describe('A list of summaries of health risks or disease outbreaks.'),
  political: z.array(IntelItemSchema).optional().describe('A list of summaries of the political situation, protests, or unrest.'),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---

export async function getCountryIntel(input: GetCountryIntelInput): Promise<{ intel: Partial<CountryIntel>, debugLog: string[] }> {
    const debugLog: string[] = [];
    debugLog.push(`[Intel Flow] Starting getCountryIntel for: ${input.countryName}`);
    
    const intel = await getCountryIntelFlow({ countryName: input.countryName, debugLog });
    
    debugLog.push("[Intel Flow] Process finished.");
    return { intel, debugLog };
}

// --- Helper Functions ---

async function searchAndVerify(query: string, apiKey: string, searchEngineId: string, debugLog: string[]): Promise<{content: string; url: string}[]> {
    debugLog.push(`[Intel Flow] (searchAndVerify) - Performing search with query: "${query}"`);
    
    const searchResult = await searchWebAction({
        query,
        apiKey,
        searchEngineId,
    });


    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        let errorDetails = searchResult.error || 'No results';
        if(searchResult.error?.includes("403")) {
            errorDetails = "The provided API key does not have permission to access the Custom Search API. Please check your Google Cloud Console configuration.";
        }
        debugLog.push(`[Intel Flow] (searchAndVerify) - Web search failed or returned no results for query: "${query}". Reason: ${errorDetails}`);
        return [];
    }
    
    debugLog.push(`[Intel Flow] (searchAndVerify) - Found ${searchResult.results.length} potential sources.`);
    const verifiedSources = [];
    const oneMonthAgo = subDays(new Date(), 30);

    for (const item of searchResult.results.slice(0, 5)) { // Process top 5 results
        debugLog.push(`[Intel Flow] (searchAndVerify) - Scraping URL: ${item.link}`);
        const scrapeResult = await scrapeUrlAction(item.link);
        if (scrapeResult.success && scrapeResult.content) {
            if (scrapeResult.publishedDate) {
                 try {
                    const publishedDate = parseISO(scrapeResult.publishedDate);
                    if (publishedDate < oneMonthAgo) {
                        debugLog.push(`[Intel Flow] (searchAndVerify) - SKIPPED (too old): ${item.link}`);
                        continue; // Skip this article because it's too old
                    }
                } catch (e) {
                     debugLog.push(`[Intel Flow] (searchAndVerify) - WARN: Could not parse date "${scrapeResult.publishedDate}" for ${item.link}. Including it anyway.`);
                }
            } else {
                 debugLog.push(`[Intel Flow] (searchAndVerify) - WARN: No publication date found for ${item.link}. Including it anyway.`);
            }

            debugLog.push(`[Intel Flow] (searchAndVerify) - SUCCESS scraping ${item.link}.`);
            verifiedSources.push({ content: scrapeResult.content, url: item.link });
        } else {
            debugLog.push(`[Intel Flow] (searchAndVerify) - FAILED scraping ${item.link}. Reason: ${scrapeResult.error}`);
        }
    }
    debugLog.push(`[Intel Flow] (searchAndVerify) - Finished. Verified ${verifiedSources.length} recent sources for query: "${query}"`);
    return verifiedSources;
}

const generateSummaryWithFallback = async (prompt: string, context: { sources: { content: string; url: string }[] }, outputSchema: any, debugLog: string[]) => {
    try {
        debugLog.push("[Intel Flow] Calling primary model (gemini-1.5-flash)...");
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: outputSchema },
            context,
        });
    } catch (error) {
        debugLog.push(`[Intel Flow] Primary model failed: ${error}. Retrying with fallback (gemini-1.5-pro)...`);
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-pro',
            output: { schema: outputSchema },
            context,
        });
    }
};

const buildSiteSearchQuery = (sites: string[]): string => sites.map(s => `site:${s.trim()}`).join(' OR ');

// --- Genkit Flow Definition ---
const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: z.object({ countryName: z.string(), debugLog: z.custom<string[]>() }),
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName, debugLog }) => {
    
    const settings = await getAppSettingsAction();
    const governmentSitesQuery = settings.infohubSources ? buildSiteSearchQuery(settings.infohubSources.split(',')) : '';
    const regionalNewsQuery = buildSiteSearchQuery(REGIONAL_NEWS_SITES);
    const localNewsQuery = buildSiteSearchQuery(LOCAL_NEWS_SITES[countryName] || []);


    const categories = {
        latestAdvisory: `official government travel advisory ${countryName} ${governmentSitesQuery}`,
        scams: `(tourist scams OR fraud) ${countryName} ${regionalNewsQuery}`,
        theft: `(theft OR robbery OR kidnapping) risk ${countryName} ${localNewsQuery}`,
        health: `(health risks OR disease outbreaks) ${countryName} ${localNewsQuery}`,
        political: `(political situation OR protests OR unrest) ${countryName} ${localNewsQuery} OR ${regionalNewsQuery}`
    };

    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[Intel Flow] CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.');
        return {};
    }

    const allPromises = Object.entries(categories).map(async ([key, query]) => {
        debugLog.push(`[Intel Flow] Starting process for category: "${key}"`);
        const sources = await searchAndVerify(query, apiKey, searchEngineId, debugLog);

        if (sources.length === 0) {
            debugLog.push(`[Intel Flow] No verified sources found for category: "${key}". Skipping AI generation.`);
            return { [key]: [] };
        }
        
        debugLog.push(`[Intel Flow] Calling AI to summarize ${sources.length} sources for category: "${key}"`);
        const { output } = await generateSummaryWithFallback(
            `You are an expert travel intelligence analyst. Your task is to provide a concise, one-paragraph summary for each provided article.
            
            IMPORTANT:
            1.  Your summary MUST be about the specific topic: "${query}".
            2.  Your summary MUST be specifically about ${countryName}.
            3.  DO NOT summarize the general purpose of the website. Focus only on the content relevant to the query.
            4.  For each summary, you MUST cite the source URL provided with it.
            
            Here are the articles:
            {{#each sources}}
            Source URL: {{{url}}}
            Article Content:
            ---
            {{{content}}}
            ---
            {{/each}}`,
            { sources },
            z.array(IntelItemSchema),
            debugLog
        );
        
        debugLog.push(`[Intel Flow] AI summarization complete for category: "${key}". Found ${output?.length || 0} items.`);
        return { [key]: output || [] };
    });

    const results = await Promise.all(allPromises);
    
    const finalOutput = results.reduce((acc, current) => ({ ...acc, ...current }), {});
    
    debugLog.push('[Intel Flow] All categories processed. Final combined output sent to client.');
    return finalOutput as CountryIntel;
  }
);
