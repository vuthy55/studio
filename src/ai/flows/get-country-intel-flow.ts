
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow orchestrates web searches and scraping to gather data,
 * then uses an AI to summarize the verified content and provide a risk assessment.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { getAppSettingsAction } from '@/actions/settings';
import { getCountryIntelData } from '@/actions/intel-admin';
import { getNeighborIntelData } from '@/actions/intel-admin';
import type { CountryIntelData } from '@/lib/types';
import { subDays, parseISO } from 'date-fns';
import { scrapeUrlAction } from '@/actions/scraper';
import { lightweightCountries } from '@/lib/location-data';


// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryCode: z.string().describe('The ISO 3166-1 alpha-2 code of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const OverallAssessmentSchema = z.object({
    paragraph1: z.string().describe("Paragraph 1: Start with a direct statement about the overall travel situation for tourists in the main, commonly visited areas."),
    paragraph2: z.string().describe("Paragraph 2: If there are specific high-risk zones (e.g., border regions, certain provinces), you MUST name them and explain the danger. If there are no specific zones, detail the most important general issues (e.g., common scams, health advice)."),
    paragraph3: z.string().describe("Paragraph 3: Provide a concluding recommendation for backpackers, summarizing whether it's safe to go and what precautions to take."),
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
  allReviewedSources: z.array(z.object({ url: z.string(), snippet: z.string() })),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---

export async function getCountryIntel(input: GetCountryIntelInput): Promise<{ intel: Partial<CountryIntel>, debugLog: string[] }> {
    const debugLog: string[] = [];
    const { countryCode } = input;

    debugLog.push(`[Intel Flow] Starting getCountryIntelFlow for: ${countryCode}`);
    const intel = await getCountryIntelFlow({ countryCode, debugLog });
    
    debugLog.push(`[Intel Flow] Process finished. Reviewed ${intel.allReviewedSources?.length || 0} sources.`);
    return { intel, debugLog };
}


// --- Helper Functions ---
/**
 * Parses a date from a string. It can handle various formats, including ISO dates and relative dates like "2 days ago".
 * @param dateString The string to parse.
 * @returns A Date object or null if parsing fails.
 */
function parseDate(dateString: string): Date | null {
  try {
    // Attempt to parse standard formats first
    const date = parseISO(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (e) {
    // Ignore errors from parseISO and try other methods
  }

  // Handle relative dates like "X days/weeks/months ago"
  const relativeMatch = dateString.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    let date = new Date();
    if (unit === 'day') date.setDate(date.getDate() - value);
    else if (unit === 'week') date.setDate(date.getDate() - value * 7);
    else if (unit === 'month') date.setMonth(date.getMonth() - value);
    else if (unit === 'year') date.setFullYear(date.getFullYear() - value);
    return date;
  }
  
  // Fallback for simple date formats that parseISO might miss
  try {
      const parsed = new Date(dateString);
      if (!isNaN(parsed.getTime())) return parsed;
  } catch (e) {}

  return null;
}

/**
 * Searches the web for a query and verifies that the results are recent.
 * It now uses a strict date-checking policy and relies on dates found in snippets.
 * @param query The search query.
 * @param apiKey The Google API key.
 * @param searchEngineId The Google Custom Search Engine ID.
 * @param debugLog An array to log debug messages.
 * @param strictDateCheck If true, enforces a 30-day freshness check. If false, allows any date.
 * @returns A promise that resolves to an array of verified sources.
 */
async function searchAndVerify(query: string, apiKey: string, searchEngineId: string, debugLog: string[], strictDateCheck: boolean): Promise<{snippet: string; url: string}[]> {
    debugLog.push(`[Intel Flow] (searchAndVerify) - Performing search. Query: "${query}", Strict Date Check: ${strictDateCheck}`);
    
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
    
    debugLog.push(`[Intel Flow] (searchAndVerify) - Found ${searchResult.results.length} potential sources. Starting date verification...`);
    const verifiedSources = [];
    const thirtyDaysAgo = subDays(new Date(), 30);

    for (const item of searchResult.results) {
        if (!item.snippet) {
            debugLog.push(`[Intel Flow] (searchAndVerify) - SKIPPED (no snippet): ${item.link}`);
            continue;
        }

        if (!strictDateCheck) {
            debugLog.push(`[Intel Flow] (searchAndVerify) - PASSED (date check ignored): ${item.link}`);
            verifiedSources.push({ snippet: item.snippet, url: item.link });
            continue;
        }

        // Try to find a date within the snippet text.
        const dateMatch = item.snippet.match(/^([A-Za-z]+\s\d{1,2},\s\d{4}|\d{4}-\d{2}-\d{2}|\d+\s\w+\sago)/);
        let publicationDate: Date | null = null;
        
        if (dateMatch) {
            publicationDate = parseDate(dateMatch[0]);
        }

        if (publicationDate) {
            if (publicationDate >= thirtyDaysAgo) {
                debugLog.push(`[Intel Flow] (searchAndVerify) - PASSED: Found recent date (${publicationDate.toISOString().split('T')[0]}) for ${item.link}`);
                verifiedSources.push({ snippet: item.snippet, url: item.link });
            } else {
                debugLog.push(`[Intel Flow] (searchAndVerify) - SKIPPED (too old: ${publicationDate.toISOString().split('T')[0]}): ${item.link}`);
            }
        } else {
             // Strict policy: if no date is found, discard the source.
             debugLog.push(`[Intel Flow] (searchAndVerify) - SKIPPED (no valid date found): ${item.link}`);
        }
    }
    
    debugLog.push(`[Intel Flow] (searchAndVerify) - Finished. Verified ${verifiedSources.length} sources for query: "${query}"`);
    return verifiedSources;
}


const buildSiteSearchQuery = (sites: string[] | undefined): string => {
    if (!sites || sites.length === 0) return '';
    return sites.filter(s => s.trim()).map(s => `site:${s.trim()}`).join(' OR ');
};

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
    inputSchema: z.object({ countryCode: z.string(), debugLog: z.custom<string[]>() }),
    outputSchema: CountryIntelSchema,
  },
  async ({ countryCode, debugLog }) => {
    
    // --- Step 1: Fetch all required data first ---
    const settings = await getAppSettingsAction();
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[Intel Flow] CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.');
        throw new Error('Google Search API credentials are not configured on the server.');
    }

    const countryData = await getCountryIntelData(countryCode);
    if (!countryData) {
        debugLog.push(`[Intel Flow] CRITICAL: No intelligence data found for ${countryCode}. Cannot proceed.`);
        return {
             finalScore: 5,
             summary: "No country intelligence data has been configured for this location yet. Please ask an administrator to build the database for this country.",
             categoryAssessments: { 'Official Advisory': 0, 'Scams & Theft': 0, 'Health': 0, 'Political Stability': 0 },
             allReviewedSources: []
        };
    }
    const countryName = countryData.countryName;

    const neighborData = await getNeighborIntelData(countryData.neighbours);
    
    // --- Step 2: Build search queries now that all data is available ---
    const governmentSitesQuery = buildSiteSearchQuery(settings.infohubGovernmentAdvisorySources.split(','));
    const globalNewsSitesQuery = buildSiteSearchQuery(settings.infohubGlobalNewsSources.split(','));
    const regionalNewsSitesQuery = buildSiteSearchQuery(countryData.regionalNews);
    const localNewsSitesQuery = buildSiteSearchQuery(countryData.localNews);
    const neighborNewsSitesQuery = buildSiteSearchQuery(neighborData.flatMap(n => n.localNews));
    
    // Handle special case for Myanmar/Burma
    const advisoryCountryName = countryName === 'Myanmar' ? '(Myanmar OR Burma)' : countryName;

    const categories: Record<string, { query: string; strictDate: boolean }> = {
        'Political Stability': { query: `(political situation OR protests OR civil unrest OR war) in ${countryName} ${globalNewsSitesQuery} ${regionalNewsSitesQuery}`, strictDate: true },
        'Health': { query: `(health risks OR disease outbreaks) in ${countryName} ${globalNewsSitesQuery}`, strictDate: true },
        'Scams & Theft': { query: `(tourist scams OR fraud OR theft OR robbery) in ${countryName} ${neighborNewsSitesQuery} ${localNewsSitesQuery}`, strictDate: true },
        'Official Advisory': { query: `official government travel advisory ${advisoryCountryName} ${governmentSitesQuery}`, strictDate: false },
    };
    
    // --- Step 3: Sequentially process each category ---
    const allSourcesByCategory: Record<string, {snippet: string, url: string}[]> = {};
    
    for (const [key, { query, strictDate }] of Object.entries(categories)) {
        debugLog.push(`[Intel Flow] Now processing category: "${key}"`);
        
        let sources = await searchAndVerify(query, apiKey, searchEngineId, debugLog, strictDate);
        
        // ** NEW FALLBACK LOGIC **
        if (key === 'Official Advisory' && sources.length === 0) {
            debugLog.push(`[Intel Flow] (Fallback) - Search failed for Official Advisory. Trying direct scrape.`);
            const advisorySources = settings.infohubGovernmentAdvisorySources.split(',');
            if (advisorySources.length > 0) {
                const scrapeResult = await scrapeUrlAction(`https://${advisorySources[0].trim()}`);
                if (scrapeResult.success && scrapeResult.content) {
                    debugLog.push(`[Intel Flow] (Fallback) - Scrape successful from ${advisorySources[0]}.`);
                    sources.push({ snippet: scrapeResult.content, url: `https://${advisorySources[0].trim()}` });
                } else {
                     debugLog.push(`[Intel Flow] (Fallback) - Scrape failed: ${scrapeResult.error}`);
                }
            }
        }
        
        allSourcesByCategory[key] = sources;
        debugLog.push(`[Intel Flow] Finished processing category: "${key}". Found ${sources.length} sources.`);
    }
    
    // --- Step 4: Final Analysis ---
    const allUniqueSources = new Map<string, { url: string; snippet: string }>();
    Object.values(allSourcesByCategory).flat().forEach(s => allUniqueSources.set(s.url, { url: s.url, snippet: s.snippet }));

    if (allUniqueSources.size === 0) {
        debugLog.push('[Intel Flow] No verifiable recent sources found across all categories. Returning a positive "safe country" assessment.');
        return {
            finalScore: 9,
            summary: "No significant, recent, and verifiable issues were found across all categories from our trusted news and government sources. \n\nThis indicates a stable and safe travel environment. \n\nTravelers should exercise standard precautions, stay aware of their surroundings, and enjoy their trip.",
            categoryAssessments: { 'Official Advisory': 1, 'Scams & Theft': 1, 'Health': 0, 'Political Stability': 0 },
            allReviewedSources: []
        };
    }
    
    debugLog.push(`[Intel Flow] Found ${allUniqueSources.size} unique sources. Calling AI for final analysis...`);

    const { output } = await generateWithFallback(
      `You are a travel intelligence analyst for young backpackers. Your task is to analyze the provided search result snippets for ${countryName}.
        The number of unique articles is ${allUniqueSources.size}.

        Here is the information gathered from different categories:
        {{#each categories}}
        --- CATEGORY: {{@key}} ---
        {{#each this}}
        Source URL: {{{url}}}
        Snippet:
        {{{snippet}}}
        
        {{/each}}
        {{/each}}

        --- INSTRUCTIONS ---
        Based *only* on the information provided in the snippets above, perform the following actions:

        1.  **Severity Score Assessment:** For each category (Official Advisory, Health, etc.), assign a **severity score** from 0 (low severity/standard precautions) to 10 (extreme severity/do not travel).
        2.  **Red Flag Protocol:** This is the most important rule. If you see clear terms like "do not travel", "reconsider travel", "state of emergency", "civil unrest", "war", or official government advice against travel to specific regions, you MUST:
            a. Assign a 10 to the 'Official Advisory' and/or 'Political Stability' category. This is mandatory.
            b. In the second paragraph of the summary, you MUST **explicitly name the dangerous regions** mentioned.
        3.  **Generate a 3-paragraph summary, populating the paragraph1, paragraph2, and paragraph3 fields.** Your summary MUST be nuanced. Acknowledge if the danger is localized. Your final recommendation should reflect this nuance, advising travelers to avoid specific areas while acknowledging that other parts of the country may be safe.
        `,
      { categories: allSourcesByCategory },
      OverallAssessmentSchema,
      debugLog
    );
    
    const aiOutput = output!;
    
    const weights = {
        'Political Stability': 2.5,
        'Official Advisory': 2.5,
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

    