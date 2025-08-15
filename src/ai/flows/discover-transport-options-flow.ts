
'use server';
/**
 * @fileOverview A Genkit flow to research transport options between two cities.
 *
 * This flow acts as a travel research agent. Given a start city, destination city, and country,
 * it uses web search tools to find flights, buses, trains, and ride-sharing options.
 * It is designed to return structured data that can be displayed to the user.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { DiscoverTransportOptionsInputSchema, DiscoverTransportOptionsOutputSchema, type DiscoverTransportOptionsInput, type DiscoverTransportOptionsOutput, TransportOptionSchema } from './types';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The travel query.
 * @param debugLog The array to log debugging information to.
 * @returns A promise that resolves to the structured transport options.
 */
export async function discoverTransportOptions(input: DiscoverTransportOptionsInput, debugLog: string[]): Promise<DiscoverTransportOptionsOutput> {
  try {
    const result = await discoverTransportOptionsFlow({ ...input, debugLog });
    return result;
  } catch (error: any) {
    console.error("[CRITICAL] Flow failed:", error);
    debugLog.push(`[CRITICAL] Flow failed: ${error.message}`);
    // Re-throw the error so the action can handle it.
    throw error;
  }
}

// --- Genkit Flow and Tool Definitions ---

const getTransportOptionsTool = ai.defineTool(
    {
        name: 'getTransportOptions',
        description: 'Get a list of transport options (flights, buses, trains, ride-sharing, ferries) between two cities in a specific country. Use web search to find the most relevant and up-to-date information.',
        inputSchema: z.object({
            fromCity: z.string(),
            toCity: z.string(),
            country: z.string(),
            debugLog: z.custom<string[]>()
        }),
        outputSchema: z.string().describe('A summary of search results containing snippets of information about transport options.'),
    },
    async (input) => {
        const { fromCity, toCity, country, debugLog } = input;
        const apiKey = process.env.GOOGLE_API_KEY!;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;

        const queries = [
            `flights from ${fromCity} to ${toCity} ${country}`,
            `bus from ${fromCity} to ${toCity} ${country}`,
            `train from ${fromCity} to ${toCity} ${country}`,
            `Grab or Uber from ${fromCity} to ${toCity} ${country}`,
            `ferry from ${fromCity} to ${toCity} ${country}`
        ];

        let searchResultsText = "";
        for (const query of queries) {
            debugLog.push(`[INFO] Searching with query: "${query}"`);
            const searchResult = await searchWebAction({ query, apiKey, searchEngineId });
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                debugLog.push(`[SUCCESS] Found ${searchResult.results.length} results for "${query}"`);
                searchResultsText += `Search results for "${query}":\n`;
                searchResult.results.forEach(res => {
                    searchResultsText += `  - Title: ${res.title}\n    Link: ${res.link}\n    Snippet: ${res.snippet}\n`;
                });
                searchResultsText += "\n";
            } else {
                 debugLog.push(`[WARN] No results found for query: "${query}". Error: ${searchResult.error || 'N/A'}`);
            }
        }
        
        return searchResultsText || "No transport options found.";
    }
);


const discoverTransportOptionsFlow = ai.defineFlow(
  {
    name: 'discoverTransportOptionsFlow',
    inputSchema: z.object({
        fromCity: z.string(),
        toCity: z.string(),
        country: z.string(),
        debugLog: z.custom<string[]>() // Define debugLog in the input schema
    }),
    outputSchema: DiscoverTransportOptionsOutputSchema,
  },
  async (input) => {
    // The debugLog is now guaranteed to exist on the input object.
    input.debugLog.push('[INFO] Starting transport options flow.');
    const { output } = await ai.generate({
        prompt: `Based on the provided search results, generate a structured list of transport options from ${input.fromCity} to ${input.toCity}.`,
        model: 'googleai/gemini-1.5-pro',
        tools: [getTransportOptionsTool],
        toolChoice: 'required',
        output: {
            schema: DiscoverTransportOptionsOutputSchema,
        }
    });

    input.debugLog.push('[INFO] AI generation complete.');
    return output!;
  }
);
