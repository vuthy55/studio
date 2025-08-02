
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow orchestrates web searches and scraping to gather data,
 * then uses an AI to summarize the verified content and provide a risk assessment.
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

const OverallAssessmentSchema = z.object({
    score: z.number().min(0).max(10).describe('An overall travel safety score from 0 (very dangerous) to 10 (very safe).'),
    summary: z.string().describe('A 3-paragraph summary: 1. Overall situation. 2. Main issues (health, political, etc.) with specific locations if possible. 3. Conclusion/recommendation for travelers, stating the number of unique articles that were used for the summary.'),
    categoryAssessments: z.object({
        'Official Advisory': z.number().describe("Risk score for Official Advisory"),
        'Scams': z.number().describe("Risk score for Scams"),
        'Theft': z.number().describe("Risk score for Theft"),
        'Health': z.number().describe("Risk score for Health"),
        'Political Stability': z.number().describe("Risk score for Political Stability"),
    }).describe("A key-value map where the key is the category name and the value is a risk score from 0-10 for that category."),
    sourcesUsed: z.array(z.object({
        url: z.string(),
        publishedDate: z.string().optional().nullable(),
    })).describe('A list of the specific source URLs and their publication dates that were most influential in writing the summary.')
});


const CountryIntelSchema = z.object({
  overallAssessment: OverallAssessmentSchema,
  allReviewedSources: z.array(z.object({
        url: z.string(),
        publishedDate: z.string().optional().nullable(),
  })).describe('A complete list of all source URLs and their publication dates that were reviewed for the analysis, even if not directly used in the summary.'),
  rawSummaries: z.record(z.array(z.object({
    summary: z.string(),
    source: z.string(),
  }))).optional().describe("The raw, un-analyzed summaries for each category."),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function with Caching ---

// The main exported function now ALWAYS fetches new data.
// It still WRITES to the cache, so the latest data is stored, but it does not READ from it.
export async function getCountryIntel(input: GetCountryIntelInput): Promise<{ intel: Partial<CountryIntel>, debugLog: string[], fromCache: boolean }> {
    const debugLog: string[] = [];
    const { countryName } = input;

    // Always run the flow to get fresh data
    debugLog.push(`[Intel Flow] Starting getCountryIntelFlow for: ${countryName}`);
    const intel = await getCountryIntelFlow({ countryName, debugLog });
    
    debugLog.push("[Intel Flow] Process finished.");
    // `fromCache` is always false because we always fetch new data.
    return { intel, debugLog, fromCache: false };
}


// --- Helper Functions ---

async function searchAndVerify(query: string, apiKey: string, searchEngineId: string, debugLog: string[]): Promise<{content: string; url: string; publishedDate?: string | null}[]> {
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
            let publishedDate: string | null = scrapeResult.publishedDate || null;
            if (publishedDate) {
                 try {
                    const parsedDate = parseISO(publishedDate);
                    if (parsedDate < oneMonthAgo) {
                        debugLog.push(`[Intel Flow] (searchAndVerify) - SKIPPED (too old): ${item.link}`);
                        continue; // Skip this article because it's too old
                    }
                } catch (e) {
                     debugLog.push(`[Intel Flow] (searchAndVerify) - WARN: Could not parse date "${publishedDate}" for ${item.link}. Including it anyway.`);
                }
            } else {
                 debugLog.push(`[Intel Flow] (searchAndVerify) - WARN: No publication date found for ${item.link}. Including it anyway.`);
            }

            debugLog.push(`[Intel Flow] (searchAndVerify) - SUCCESS scraping ${item.link}.`);
            verifiedSources.push({ content: scrapeResult.content, url: item.link, publishedDate });
        } else {
            debugLog.push(`[Intel Flow] (searchAndVerify) - FAILED scraping ${item.link}. Reason: ${scrapeResult.error}`);
        }
    }
    debugLog.push(`[Intel Flow] (searchAndVerify) - Finished. Verified ${verifiedSources.length} recent sources for query: "${query}"`);
    return verifiedSources;
}

const generateWithFallback = async (prompt: string, context: any, outputSchema: any, debugLog: string[]) => {
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
        'Official Advisory': `official government travel advisory ${countryName} ${governmentSitesQuery}`,
        'Scams': `(tourist scams OR fraud) ${countryName} ${regionalNewsQuery}`,
        'Theft': `(theft OR robbery OR kidnapping) risk ${countryName} ${localNewsQuery}`,
        'Health': `(health risks OR disease outbreaks) ${countryName} ${localNewsQuery}`,
        'Political Stability': `(political situation OR protests OR unrest) ${countryName} ${localNewsQuery} OR ${regionalNewsQuery}`
    };

    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[Intel Flow] CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.');
        return {};
    }

    const allSourcesByCategory: Record<string, {content: string, url: string, publishedDate?: string | null}[]> = {};
    const allUniqueSources = new Map<string, { url: string; publishedDate?: string | null }>();


    const searchPromises = Object.entries(categories).map(async ([key, query]) => {
        debugLog.push(`[Intel Flow] Starting search for category: "${key}"`);
        const sources = await searchAndVerify(query, apiKey, searchEngineId, debugLog);
        allSourcesByCategory[key] = sources;
        sources.forEach(s => allUniqueSources.set(s.url, { url: s.url, publishedDate: s.publishedDate }));
    });

    await Promise.all(searchPromises);
    
    if (Object.values(allSourcesByCategory).every(sources => sources.length === 0)) {
        debugLog.push('[Intel Flow] No verifiable sources found across all categories. Returning empty assessment.');
        return {
            overallAssessment: {
                score: 5,
                summary: "No specific, recent, and verifiable information was found across all categories. This could indicate a lack of major reported issues. \n\nTravelers should exercise standard precautions. \n\nWithout specific data, it's recommended to consult your country's official travel advisory and stay aware of your surroundings.",
                sourcesUsed: [],
                categoryAssessments: {
                    'Official Advisory': 5,
                    'Scams': 5,
                    'Theft': 5,
                    'Health': 5,
                    'Political Stability': 5
                }
            },
            allReviewedSources: []
        };
    }
    
    debugLog.push(`[Intel Flow] Found sources. Calling AI for final analysis...`);

    const { output } = await generateWithFallback(
      `You are a senior travel intelligence analyst for an audience of young backpackers. Your task is to analyze the provided raw text from various articles and generate a clear, concise, and actionable travel briefing for ${countryName}.

      Here is the information gathered from different categories:

      {{#each categories}}
      --- CATEGORY: {{@key}} ---
      {{#each this}}
      Source URL: {{{url}}}
      Article Content:
      {{{content}}}
      
      {{/each}}
      {{/each}}

      --- ANALYSIS INSTRUCTIONS ---
      Based *only* on the information provided above, perform the following actions:

      1.  **Category Assessments:** For each category (Official Advisory, Scams, Theft, Health, Political Stability), provide a risk score from 0 (High Risk) to 10 (Very Safe).
      2.  **Overall Assessment Score:** Assign a single, holistic travel safety score for ${countryName} on a scale from 0 (very high risk) to 10 (very safe). This should be your expert judgment based on the severity and combination of all factors, not just an average of the category scores.
      3.  **Identify Key Sources:** From the articles provided, identify the most critical URLs that directly informed your summary. List only these key sources.
      4.  **Generate a 3-paragraph summary.** 
          *   First, start with a direct statement about the current travel situation. Is it stable? Are there significant concerns?
          *   Next, detail the *most important* issues affecting travelers. For each issue, specify the category (e.g., Health, Political, Scams) and, if the text mentions it, the specific city or province. If there are no major issues, state that the situation appears stable.
          *   Finally, provide a concluding thought or recommendation for a backpacker. This final paragraph must also state the total number of unique articles that were used for this assessment.`,
      { categories: allSourcesByCategory },
      OverallAssessmentSchema,
      debugLog
    );
    
    const finalOutput = output!;

    return { 
        overallAssessment: finalOutput,
        allReviewedSources: Array.from(allUniqueSources.values())
    };
  }
);
    

    