
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
import { DiscoverTransportOptionsInputSchema, DiscoverTransportOptionsOutputSchema, type DiscoverTransportOptionsInput, type DiscoverTransportOptionsOutput } from './types';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * This function now performs the web search itself and passes the results to the AI for analysis.
 * @param input The travel query.
 * @param debugLog The array to log debugging information to.
 * @returns A promise that resolves to the structured transport options.
 */
export async function discoverTransportOptions(input: DiscoverTransportOptionsInput, debugLog: string[]): Promise<DiscoverTransportOptionsOutput> {
  const { fromCity, toCity, country } = input;
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
  
  if (!searchResultsText.trim()) {
    debugLog.push('[FAIL] No information found from any web search.');
    return []; // Return empty array if no search results at all
  }
  
  try {
    const result = await discoverTransportOptionsFlow({ fromCity, toCity, searchResultsText });
    return result;
  } catch (error: any) {
    debugLog.push(`[CRITICAL] Flow execution failed: ${error.message}`);
    throw error;
  }
}

// --- Genkit Flow and Prompt Definitions ---

const discoverTransportOptionsFlow = ai.defineFlow(
  {
    name: 'discoverTransportOptionsFlow',
    inputSchema: z.object({
        fromCity: z.string(),
        toCity: z.string(),
        searchResultsText: z.string().describe("The raw text from web search results containing transport information."),
    }),
    outputSchema: DiscoverTransportOptionsOutputSchema,
  },
  async ({ fromCity, toCity, searchResultsText }) => {
    const { output } = await ai.generate({
        prompt: `
          You are an intelligent travel agent. Your task is to analyze the provided web search result snippets and extract structured information about transportation options from ${fromCity} to ${toCity}.
          
          Analyze the following search results:
          ---
          ${searchResultsText}
          ---
          
          Based ONLY on the text provided, generate a list of transport options. For each option, provide:
          - The type of transport (e.g., flight, bus, train).
          - The name of the company or provider.
          - An estimated travel time.
          - A typical price range.
          - A direct URL for booking if available in the snippets.
          
          If the information for a field isn't present in the snippets for a particular option, omit that field. Do not make up information.
        `,
        model: 'googleai/gemini-1.5-pro',
        output: {
            schema: DiscoverTransportOptionsOutputSchema,
        }
    });

    return output!;
  }
);
