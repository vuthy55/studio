
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
import { getCountryTransportData } from '@/actions/transport-admin';
import { lightweightCountries } from '@/lib/location-data';

// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * This function now performs the web search itself and passes the results to the AI for analysis.
 * It uses the pre-built transport database to perform targeted searches.
 */
export async function discoverTransportOptions(input: DiscoverTransportOptionsInput, debugLog: string[]): Promise<DiscoverTransportOptionsOutput> {
  const { fromCity, toCity, country } = input;
  const apiKey = process.env.GOOGLE_API_KEY!;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;
  
  const countryInfo = lightweightCountries.find(c => c.name.toLowerCase() === country.toLowerCase());
  const transportProviders = countryInfo ? await getCountryTransportData(countryInfo.code) : null;
  
  debugLog.push(`[INFO] Starting transport options flow for ${fromCity} to ${toCity}, ${country}.`);

  const queries: string[] = [];

  // Add targeted queries for airlines if they exist
  if (transportProviders?.regionalTransportProviders?.length) {
    transportProviders.regionalTransportProviders.forEach(provider => {
      queries.push(`flights from ${fromCity} to ${toCity} site:${provider}`);
    });
  } else {
      queries.push(`flights from ${fromCity} to ${toCity} ${country}`);
  }

  // Add targeted queries for local providers (bus, train, etc.)
  if (transportProviders?.localTransportProviders?.length) {
     transportProviders.localTransportProviders.forEach(provider => {
      queries.push(`"${fromCity} to ${toCity}" site:${provider}`);
    });
  }
  
  // Add generic fallback queries
  queries.push(`bus from ${fromCity} to ${toCity} ${country}`);
  queries.push(`ETS train ticket price and schedule ${fromCity} to ${toCity}`);
  queries.push(`Grab or Uber from ${fromCity} to ${toCity} ${country}`);
  queries.push(`ferry from ${fromCity} to ${toCity} ${country}`);

  const uniqueQueries = [...new Set(queries)];

  let searchResultsText = "";
  for (const query of uniqueQueries) {
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
    const result = await discoverTransportOptionsFlow({ fromCity, toCity, searchResultsText, debugLog });
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
        debugLog: z.custom<string[]>()
    }),
    outputSchema: DiscoverTransportOptionsOutputSchema,
  },
  async ({ fromCity, toCity, searchResultsText, debugLog }) => {
    
    debugLog.push('[INFO] Passing search results to AI for analysis.');

    const { output } = await ai.generate({
        prompt: `
          You are an intelligent travel agent. Your task is to analyze the provided web search result snippets and extract structured information about transportation options from ${fromCity} to ${toCity}.
          
          Analyze the following search results:
          ---
          ${searchResultsText}
          ---
          
          Based ONLY on the text provided, generate a list of transport options. For each option, provide:
          - The type of transport (e.g., flight, bus, train, ride-sharing, ferry).
          - The full name of the company or provider (e.g., 'AirAsia', 'Plusliner', 'KTM Berhad'). If no company is explicitly mentioned for a type (e.g., a generic bus result), set the company to 'Various'.
          - An estimated travel time, including a range if possible (e.g., '1 hour', '4-5 hours').
          - A typical price range in USD. If you find a single price in a local currency (e.g., "RM 35"), do a rough conversion and present it as a small range (e.g., if RM35 is ~$8 USD, return "$8 - $10 USD").
          - A direct URL for booking if available in the snippets. Prioritize direct provider links over aggregators if possible.
          
          CRITICAL: Do not leave fields blank. If you cannot find a specific piece of information for an option (like price or travel time), explicitly state "Not Available". Do not make up information.
        `,
        model: 'googleai/gemini-1.5-pro',
        output: {
            schema: DiscoverTransportOptionsOutputSchema,
        }
    });
    
    debugLog.push('[SUCCESS] AI analysis complete.');
    return output!;
  }
);
