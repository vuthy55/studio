
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
import { getCountryIntelData, getNeighborIntelData } from '@/actions/intel-admin';
import type { CountryIntelData } from '@/lib/types';


// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const OverallAssessmentSchema = z.object({
    paragraph1: z.string().describe("Paragraph 1: Start with a direct statement about the overall travel situation."),
    paragraph2: z.string().describe("Paragraph 2: Detail the *most important* issues affecting travelers, specifying the category."),
    paragraph3: z.string().describe("Paragraph 3: Provide a concluding recommendation for backpackers."),
    categoryAssessments: z.object({
        'Official Advisory': z.number().min(0).max(10).describe("Severity score (0-10) for Official Advisory."),
        'Scams & Theft': z.number().min(0).max(10).describe("Severity score (0-10) for Scams and Theft."),
        'Health': z.number().min(0).max(10).describe("Severity score (0-10) for Health."),
        'Political Stability': z.number().min(0).max(10).describe("Severity score (0-10) for Political Stability."),
    }).describe("A key-value map where the key is the category name and the value is a severity score from 0 (low severity) to 10 (extreme severity)."),
});


const CountryIntelSchema = z.object({
  finalScore: z.number().min(0).max(10),
  categoryAssessments: z.record(z.string(), z.number()),
  summary: z.string(),
  allReviewedSources: z.array(z.object({ url: z.string(), publishedDate: z.string().optional().nullable() })),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---

export async function getCountryIntel(input: GetCountryIntelInput): Promise<{ intel: Partial<CountryIntel>, debugLog: string[] }> {
    const debugLog: string[] = [];
    const { countryName } = input;

    debugLog.push(`[Intel Flow] Starting getCountryIntelFlow for: ${countryName}`);
    const intel = await getCountryIntelFlow({ countryName, debugLog });
    
    debugLog.push(`[Intel Flow] Process finished. Reviewed ${intel.allReviewedSources?.length || 0} sources.`);
    return { intel, debugLog };
}


// --- Helper Functions ---

async function searchAndVerify(query: string, apiKey: string, searchEngineId: string, debugLog: string[]): Promise<{content: string; url: string; publishedDate?: string | null}[]> {
    debugLog.push(`[Intel Flow] (searchAndVerify) - Performing search with query: "${query}"`);
    
    const searchResult = await searchWebAction({ query, apiKey, searchEngineId });

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
    const thirtyDaysAgo = subDays(new Date(), 30);

    for (const item of searchResult.results.slice(0, 3)) { // Process top 3 results per query
        debugLog.push(`[Intel Flow] (searchAndVerify) - Scraping URL: ${item.link}`);
        const scrapeResult = await scrapeUrlAction(item.link);
        
        if (scrapeResult.success && scrapeResult.content) {
            let publishedDate: string | null = scrapeResult.publishedDate || null;
            if (publishedDate) {
                 try {
                    const parsedDate = parseISO(publishedDate);
                    if (parsedDate < thirtyDaysAgo) {
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

const buildSiteSearchQuery = (sites: string[] | undefined): string => {
    if (!sites || sites.length === 0) return '';
    return sites.map(s => `site:${s.trim()}`).join(' OR ');
}

const generateWithFallback = async (prompt: string, context: any, outputSchema: any, debugLog: string[]) => {
    try {
        debugLog.push('[Intel Flow] Generating with primary model (gemini-1.5-flash)...');
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
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[Intel Flow] CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.');
        return {};
    }

    const countryData = await getCountryIntelData(countryName);
    if (!countryData) {
        debugLog.push(`[Intel Flow] CRITICAL: No intelligence data found for ${countryName}. Cannot proceed.`);
        return {
             finalScore: 5,
             summary: "No country intelligence data has been configured for this location yet. Please ask an administrator to build the database for this country.",
             categoryAssessments: { 'Official Advisory': 0, 'Scams & Theft': 0, 'Health': 0, 'Political Stability': 0 },
             allReviewedSources: []
        };
    }

    const neighborData = await getNeighborIntelData(countryData.neighbours);

    const governmentSitesQuery = buildSiteSearchQuery(settings.infohubGovernmentAdvisorySources.split(','));
    const globalNewsSitesQuery = buildSiteSearchQuery(settings.infohubGlobalNewsSources.split(','));
    const regionalNewsSitesQuery = buildSiteSearchQuery(countryData.regionalNews);
    const localNewsSitesQuery = buildSiteSearchQuery(countryData.localNews);
    const neighborNewsSitesQuery = buildSiteSearchQuery(neighborData.flatMap(n => n.localNews));

    const categories: Record<string, string> = {
        'Official Advisory': `official government travel advisory ${countryName} ${governmentSitesQuery}`,
        'Political Stability': `(political situation OR protests OR civil unrest OR war) in ${countryName} ${globalNewsSitesQuery} ${regionalNewsSitesQuery}`,
        'Health': `(health risks OR disease outbreaks) in ${countryName} ${globalNewsSitesQuery}`,
        'Scams & Theft': `(tourist scams OR fraud OR theft OR robbery) in ${countryName} ${neighborNewsSitesQuery} ${localNewsSitesQuery}`,
    };
    
    // Filter out categories where the site search query part is empty
    const validCategories = Object.fromEntries(
        Object.entries(categories).filter(([_, query]) => !/\(\s*\)/.test(query.replace(/\w+/g, '')))
    );

    const allSourcesByCategory: Record<string, {content: string, url: string, publishedDate?: string | null}[]> = {};
    const allUniqueSources = new Map<string, { url: string; publishedDate?: string | null }>();

    const searchPromises = Object.entries(validCategories).map(async ([key, query]) => {
        debugLog.push(`[Intel Flow] Starting search for category: "${key}"`);
        const sources = await searchAndVerify(query, apiKey, searchEngineId, debugLog);
        allSourcesByCategory[key] = sources;
        sources.forEach(s => allUniqueSources.set(s.url, { url: s.url, publishedDate: s.publishedDate }));
    });

    await Promise.all(searchPromises);
    
    if (allUniqueSources.size === 0) {
        debugLog.push('[Intel Flow] No verifiable sources found across all categories. Returning empty assessment.');
        return {
            finalScore: 5,
            summary: "No specific, recent, and verifiable information was found across all categories. This could indicate a lack of major reported issues. \n\nTravelers should exercise standard precautions. \n\nWithout specific data, it's recommended to consult your country's official travel advisory and stay aware of your surroundings.",
            categoryAssessments: { 'Official Advisory': 0, 'Scams & Theft': 0, 'Health': 0, 'Political Stability': 0 },
            allReviewedSources: []
        };
    }
    
    debugLog.push(`[Intel Flow] Found ${allUniqueSources.size} unique sources. Calling AI for final analysis...`);

    const { output } = await generateWithFallback(
      `You are a travel intelligence analyst for young backpackers. Your task is to analyze the provided articles for ${countryName}.
        The number of unique articles is ${allUniqueSources.size}.

        Here is the information gathered from different categories:
        {{#each categories}}
        --- CATEGORY: {{@key}} ---
        {{#each this}}
        Source URL: {{{url}}}
        Publication Date: {{#if publishedDate}}{{publishedDate}}{{else}}Not Available{{/if}}
        Article Content:
        {{{content}}}
        
        {{/each}}
        {{/each}}

        --- INSTRUCTIONS ---
        Based *only* on the information provided above, perform the following actions:

        1.  **Severity Score Assessment:** For each category (Official Advisory, Scams & Theft, Health, Political Stability), assign a **severity score** from 0 (low severity/standard precautions) to 10 (extreme severity/do not travel). If you see red flag terms like "war", "do not travel", "state of emergency", or "civil unrest", you MUST assign a 10 to the Political Stability category.
        2.  **Generate a 3-paragraph summary, populating the paragraph1, paragraph2, and paragraph3 fields.**
        `,
      { categories: allSourcesByCategory },
      OverallAssessmentSchema,
      debugLog
    );
    
    const aiOutput = output!;
    
    const weights = {
        'Official Advisory': 1.5,
        'Political Stability': 1.5,
        'Health': 1.0,
        'Scams & Theft': 1.0,
    };
    
    let totalSeverity = 0;
    let totalWeight = 0;
    
    for (const [category, score] of Object.entries(aiOutput.categoryAssessments)) {
        const weight = weights[category as keyof typeof weights] || 1.0;
        totalSeverity += score * weight;
        totalWeight += weight;
    }
    
    const weightedAverageSeverity = totalSeverity > 0 ? totalSeverity / totalWeight : 0;
    const finalScore = Math.max(0, Math.round(10 - weightedAverageSeverity));

    debugLog.push(`[Intel Flow] Weighted Average Severity: ${weightedAverageSeverity.toFixed(2)}`);
    debugLog.push(`[Intel Flow] Calculated Final Score: ${finalScore}`);
    
    return { 
        finalScore,
        summary: `${aiOutput.paragraph1}\n\n${aiOutput.paragraph2}\n\n${aiOutput.paragraph3}`,
        categoryAssessments: aiOutput.categoryAssessments,
        allReviewedSources: Array.from(allUniqueSources.values())
    };
  }
);
