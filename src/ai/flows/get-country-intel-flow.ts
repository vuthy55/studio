
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

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const IntelItemSchema = z.object({
    summary: z.string().describe('A concise, one-paragraph summary of the key information from the source article.'),
    source: z.string().url().describe('The URL of the source article.'),
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

async function searchAndVerify(query: string, debugLog: string[]): Promise<{content: string; url: string}[]> {
    debugLog.push(`[Intel Flow] (searchAndVerify) - Performing search with query: "${query}"`);
    const searchResult = await searchWebAction(query);

    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        debugLog.push(`[Intel Flow] (searchAndVerify) - Web search failed or returned no results for query: "${query}"`);
        return [];
    }
    
    debugLog.push(`[Intel Flow] (searchAndVerify) - Found ${searchResult.results.length} potential sources.`);
    const verifiedSources = [];
    for (const item of searchResult.results) {
        debugLog.push(`[Intel Flow] (searchAndVerify) - Scraping URL: ${item.link}`);
        const scrapeResult = await scrapeUrlAction(item.link);
        if (scrapeResult.success && scrapeResult.content) {
            debugLog.push(`[Intel Flow] (searchAndVerify) - SUCCESS scraping ${item.link}.`);
            verifiedSources.push({ content: scrapeResult.content, url: item.link });
        } else {
            debugLog.push(`[Intel Flow] (searchAndVerify) - FAILED scraping ${item.link}. Reason: ${scrapeResult.error}`);
        }
    }
    debugLog.push(`[Intel Flow] (searchAndVerify) - Finished. Verified ${verifiedSources.length} out of ${searchResult.results.length} sources for query: "${query}"`);
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

// --- Genkit Flow Definition ---
const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: z.object({ countryName: z.string(), debugLog: z.custom<string[]>() }),
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName, debugLog }) => {
    
    const categories = {
        latestAdvisory: `official government travel advisory ${countryName}`,
        scams: `tourist scams ${countryName}`,
        theft: `theft robbery kidnapping risk ${countryName}`,
        health: `health risks disease outbreaks ${countryName}`,
        political: `political situation protests unrest ${countryName}`
    };

    const allPromises = Object.entries(categories).map(async ([key, query]) => {
        debugLog.push(`[Intel Flow] Starting process for category: "${key}"`);
        const sources = await searchAndVerify(query, debugLog);

        if (sources.length === 0) {
            debugLog.push(`[Intel Flow] No verified sources found for category: "${key}". Skipping AI generation.`);
            return { [key]: [] };
        }
        
        debugLog.push(`[Intel Flow] Calling AI to summarize ${sources.length} sources for category: "${key}"`);
        const { output } = await generateSummaryWithFallback(
            `You are an expert travel intelligence analyst. Based on the provided articles, generate a concise, one-paragraph summary for each article. For each summary, you MUST cite the source URL provided with it.
            
            Your task is to summarize the following articles about: ${query}
            
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
