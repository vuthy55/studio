
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
 * @param input The travel query.
 * @returns A promise that resolves to the structured transport options.
 */
export async function discoverTransportOptions(input: DiscoverTransportOptionsInput): Promise<DiscoverTransportOptionsOutput> {
  const result = await discoverTransportOptionsFlow(input);
  return result;
}

// --- Genkit Flow and Tool Definitions ---

const getTransportOptionsTool = ai.defineTool(
    {
        name: 'getTransportOptions',
        description: 'Get a list of transport options (flights, buses, trains, ride-sharing) between two cities in a specific country. Use web search to find the most relevant and up-to-date information.',
        inputSchema: DiscoverTransportOptionsInputSchema,
        outputSchema: DiscoverTransportOptionsOutputSchema,
    },
    async (input) => {
        const { fromCity, toCity, country } = input;
        const apiKey = process.env.GOOGLE_API_KEY!;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;

        const queries = [
            `flights from ${fromCity} to ${toCity} ${country}`,
            `bus from ${fromCity} to ${toCity} ${country}`,
            `train from ${fromCity} to ${toCity} ${country}`,
            `Grab or Uber from ${fromCity} to ${toCity} ${country}`
        ];

        let searchResultsText = "";
        for (const query of queries) {
            const searchResult = await searchWebAction({ query, apiKey, searchEngineId });
            if (searchResult.success && searchResult.results) {
                searchResultsText += `Search results for "${query}":\n`;
                searchResult.results.forEach(res => {
                    searchResultsText += `  - Title: ${res.title}\n    Link: ${res.link}\n    Snippet: ${res.snippet}\n`;
                });
                searchResultsText += "\n";
            }
        }
        
        return searchResultsText;
    }
);


const discoverTransportOptionsFlow = ai.defineFlow(
  {
    name: 'discoverTransportOptionsFlow',
    inputSchema: DiscoverTransportOptionsInputSchema,
    outputSchema: DiscoverTransportOptionsOutputSchema,
  },
  async (input) => {

    const { output } = await ai.generate({
        prompt: `Based on the provided web search results, identify the transport options for the user's query.
        For each distinct option, provide the transportation type, the company/provider, an estimated travel time, a typical price range, and a booking URL.
        Prioritize well-known booking sites like Skyscanner, 12go.asia, or official carrier websites.
        Do not invent information. If no clear data is available for a transport type, omit it.
        
        Query: ${input.fromCity} to ${input.toCity} in ${input.country}
        `,
        model: 'googleai/gemini-1.5-pro',
        tools: [getTransportOptionsTool],
        toolChoice: 'required',
        output: {
            schema: DiscoverTransportOptionsOutputSchema,
        }
    });

    return output!;
  }
);
