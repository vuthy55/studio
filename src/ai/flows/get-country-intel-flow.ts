
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
    finalScore: z.number().min(0).max(10).describe('The final, reconciled travel safety score from 0 (very dangerous) to 10 (very safe).'),
    analystScore: z.number().min(0).max(10).describe('The AI analyst\'s holistic score from 0-10.'),
    quantitativeScore: z.number().min(0).max(10).describe('The raw, calculated score based on category risk points (0-2 for each).'),
    summary: z.string().describe('A 3-paragraph summary: 1. Overall situation. 2. Main issues (health, political, etc.) with specific locations if possible. 3. Conclusion/recommendation for travelers, stating the number of unique articles that were used for the summary.'),
    categoryAssessments: z.object({
        'Official Advisory': z.number().min(0).max(2).describe("Risk points (0-2) for Official Advisory"),
        'Scams': z.number().min(0).max(2).describe("Risk points (0-2) for Scams"),
        'Theft': z.number().min(0).max(2).describe("Risk points (0-2) for Theft"),
        'Health': z.number().min(0).max(2).describe("Risk points (0-2) for Health"),
        'Political Stability': z.number().min(0).max(2).describe("Risk points (0-2) for Political Stability"),
    }).describe("A key-value map where the key is the category name and the value is risk points from 0-2 (0=negative, 1=neutral, 2=positive)."),
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


// --- Main Exported Function ---

export async function getCountryIntel(input: GetCountryIntelInput): Promise<{ intel: Partial<CountryIntel>, debugLog: string[] }> {
    const debugLog: string[] = [];
    const { countryName } = input;

    debugLog.push(`[Intel Flow] Starting getCountryIntelFlow for: ${countryName}`);
    const intel = await getCountryIntelFlow({ countryName, debugLog });
    
    debugLog.push("[Intel Flow] Process finished.");
    return { intel, debugLog };
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


const buildSiteSearchQuery = (sites: string[]): string => sites.map(s => `site:${s.trim()}`).join(' OR ');

const generateWithFallback = async (prompt: string, context: any, outputSchema: any, debugLog: string[]) => {
    try {
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
                finalScore: 5,
                analystScore: 5,
                quantitativeScore: 5,
                summary: "No specific, recent, and verifiable information was found across all categories. This could indicate a lack of major reported issues. \n\nTravelers should exercise standard precautions. \n\nWithout specific data, it's recommended to consult your country's official travel advisory and stay aware of your surroundings.",
                sourcesUsed: [],
                categoryAssessments: {
                    'Official Advisory': 1, 'Scams': 1, 'Theft': 1, 'Health': 1, 'Political Stability': 1
                }
            },
            allReviewedSources: []
        };
    }
    
    debugLog.push(`[Intel Flow] Found sources. Calling AI for final analysis...`);

    const { output } = await generateWithFallback(
      `You are a travel intelligence analyst. Your audience is young backpackers. Analyze the provided raw text from various articles and generate a clear, concise, and actionable travel briefing for ${countryName}.

        Here is the information gathered from different categories:

        {{#each categories}}
        --- CATEGORY: {{@key}} ---
        {{#each this}}
        Source URL: {{{url}}}
        Article Content:
        {{{content}}}
        
        {{/each}}
        {{/each}}

        --- INSTRUCTIONS ---
        Based *only* on the information provided above, perform the following actions:

        1.  **Quantitative Category Assessment:** For each category (Official Advisory, Scams, Theft, Health, Political Stability), assign risk points: 0 for negative news (active warnings, high risk), 1 for neutral/cautionary news (standard advice), 2 for positive news (improved safety, low risk).
        2.  **Holistic Analyst Score:** As an expert, assign a single, holistic travel safety score for ${countryName} from 0 (very high risk) to 10 (very safe). This should be your expert judgment based on the severity and combination of all factors, not just an average.
        3.  **Identify Key Sources:** From all the articles provided, identify the most critical URLs that directly informed your summary. List only these key sources with their publication dates.
        4.  **Generate a 3-paragraph summary:**
            *   Paragraph 1: Start with a direct statement about the current travel situation. Is it stable? Are there significant concerns?
            *   Paragraph 2: Detail the *most important* issues affecting travelers. For each issue, specify the category (e.g., Health, Political, Scams) and, if the text mentions it, the specific city or province. If there are no major issues, state that the situation appears stable.
            *   Paragraph 3: Provide a concluding thought or recommendation for a backpacker. This final paragraph must also state the total number of unique articles that were used for this assessment.
        `,
      { categories: allSourcesByCategory },
      OverallAssessmentSchema,
      debugLog
    );
    
    const finalOutput = output!;

    // Reconciliation logic
    const { analystScore, quantitativeScore } = finalOutput;
    const scoreDifference = Math.abs(analystScore - quantitativeScore);
    const isDivergent = (quantitativeScore > 0) && (scoreDifference / quantitativeScore > 0.20);
    
    if (isDivergent) {
         debugLog.push(`[Intel Flow] Scores are divergent (Analyst: ${analystScore}, Quant: ${quantitativeScore}). Returning neutral assessment.`);
         return {
            overallAssessment: {
                finalScore: 5, analystScore: 5, quantitativeScore: 5,
                summary: "Our AI analysis resulted in conflicting risk assessments, which can happen when news is mixed or lacks clear official guidance. For your safety, we are providing a neutral score. \n\nPlease exercise standard travel precautions and consult your country's official travel advisories directly for the most reliable information. \n\nWe recommend being aware of your surroundings, securing valuables, and staying informed on local conditions.",
                sourcesUsed: [],
                categoryAssessments: { 'Official Advisory': 1, 'Scams': 1, 'Theft': 1, 'Health': 1, 'Political Stability': 1 }
            },
            allReviewedSources: Array.from(allUniqueSources.values())
        };
    }

    finalOutput.finalScore = finalOutput.analystScore; // Use analyst score if consistent
    
    return { 
        overallAssessment: finalOutput,
        allReviewedSources: Array.from(allUniqueSources.values())
    };
  }
);
    

    
