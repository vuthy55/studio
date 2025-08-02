
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow queries the Gemini model for a travel briefing.
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
export async function getCountryIntel(input: GetCountryIntelInput): Promise<Partial<CountryIntel>> {
  console.log(`[Intel Flow] Starting getCountryIntel for: ${input.countryName}`);
  return getCountryIntelFlow(input);
}

// --- Helper Functions ---

async function searchAndVerify(query: string): Promise<{content: string; url: string}[]> {
    console.log(`[Intel Flow] (searchAndVerify) - Performing search with query: "${query}"`);
    const searchResult = await searchWebAction(query);

    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        console.warn(`[Intel Flow] (searchAndVerify) - Web search failed or returned no results for query: "${query}"`);
        return [];
    }
    
    console.log(`[Intel Flow] (searchAndVerify) - Found ${searchResult.results.length} potential sources.`);
    const verifiedSources = [];
    for (const item of searchResult.results) {
        console.log(`[Intel Flow] (searchAndVerify) - Scraping URL: ${item.link}`);
        const scrapeResult = await scrapeUrlAction(item.link);
        if (scrapeResult.success && scrapeResult.content) {
            console.log(`[Intel Flow] (searchAndVerify) - SUCCESS scraping ${item.link}.`);
            // Optional: Add date check here if scrapeResult returns a date
            verifiedSources.push({ content: scrapeResult.content, url: item.link });
        } else {
            console.warn(`[Intel Flow] (searchAndVerify) - FAILED scraping ${item.link}. Reason: ${scrapeResult.error}`);
        }
    }
    console.log(`[Intel Flow] (searchAndVerify) - Finished. Verified ${verifiedSources.length} out of ${searchResult.results.length} sources for query: "${query}"`);
    return verifiedSources;
}

const generateSummaryWithFallback = async (prompt: string, context: { sources: { content: string; url: string }[] }, outputSchema: any) => {
    try {
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: outputSchema },
            context,
        });
    } catch (error) {
        console.warn("[Intel Flow] Primary model (gemini-1.5-flash) failed. Retrying with fallback.", error);
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
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName }) => {
    
    const categories = {
        latestAdvisory: `official government travel advisory ${countryName}`,
        scams: `tourist scams ${countryName}`,
        theft: `theft robbery kidnapping risk ${countryName}`,
        health: `health risks disease outbreaks ${countryName}`,
        political: `political situation protests unrest ${countryName}`
    };

    const allPromises = Object.entries(categories).map(async ([key, query]) => {
        console.log(`[Intel Flow] Starting process for category: "${key}"`);
        const sources = await searchAndVerify(query);

        if (sources.length === 0) {
            console.log(`[Intel Flow] No verified sources found for category: "${key}". Skipping AI generation.`);
            return { [key]: [] };
        }
        
        console.log(`[Intel Flow] Calling AI to summarize ${sources.length} sources for category: "${key}"`);
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
            z.array(IntelItemSchema)
        );
        
        console.log(`[Intel Flow] AI summarization complete for category: "${key}". Found ${output?.length || 0} items.`);
        return { [key]: output || [] };
    });

    const results = await Promise.all(allPromises);
    
    const finalOutput = results.reduce((acc, current) => ({ ...acc, ...current }), {});
    
    console.log('[Intel Flow] All categories processed. Final combined output:', finalOutput);
    return finalOutput as CountryIntel;
  }
);
