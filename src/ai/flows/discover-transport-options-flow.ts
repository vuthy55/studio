
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
import { getCountryTransportData } from '@/actions/transport-admin';
import { lightweightCountries } from '@/lib/location-data';
import { scrapeUrlAction } from '@/actions/scraper';

// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * This function now performs multiple web searches, scrapes the top results for each,
 * and passes the full content along with snippets to the AI for analysis.
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

  // 1. Add targeted searches for known providers
  if (transportProviders?.regionalTransportProviders?.length) {
    transportProviders.regionalTransportProviders.forEach(provider => {
      queries.push(`flights from ${fromCity} to ${toCity} schedule site:${provider}`);
    });
  }
  if (transportProviders?.localTransportProviders?.length) {
     transportProviders.localTransportProviders.forEach(provider => {
      queries.push(`"${fromCity} to ${toCity}" tickets site:${provider}`);
    });
  }
  
  // 2. Always include generic fallback queries to catch anything missed
  queries.push(`flights from ${fromCity} to ${toCity} ${country}`);
  queries.push(`bus from ${fromCity} to ${toCity} ${country}`);
  queries.push(`ETS train ticket price and schedule ${fromCity} to ${toCity}`);
  queries.push(`Grab or Uber from ${fromCity} to ${toCity} ${country}`);
  queries.push(`ferry from ${fromCity} to ${toCity} ${country}`);

  const uniqueQueries = [...new Set(queries)];
  debugLog.push(`[INFO] Compiled ${uniqueQueries.length} unique search queries.`);

  let searchResultsText = "";
  for (const query of uniqueQueries) {
      debugLog.push(`[INFO] Searching with query: "${query}"`);
      const searchResult = await searchWebAction({ query, apiKey, searchEngineId });
      
      if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
          debugLog.push(`[SUCCESS] Found ${searchResult.results.length} result(s) for "${query}".`);

          // Scrape the top 2 results to get richer content
          const scrapePromises = searchResult.results.slice(0, 2).map(result => scrapeUrlAction(result.link));
          const scrapeResults = await Promise.all(scrapePromises);
          
          let contentFound = false;
          scrapeResults.forEach((scrapeResult, index) => {
              const url = searchResult.results![index].link;
              if (scrapeResult.success && scrapeResult.content) {
                  debugLog.push(`[SUCCESS] Scraped ${scrapeResult.content.length} characters from ${url}`);
                  searchResultsText += `Content from ${url} (for query "${query}"):\n${scrapeResult.content}\n\n---\n\n`;
                  contentFound = true;
              } else {
                  debugLog.push(`[WARN] Failed to scrape ${url}. Using snippet instead. Error: ${scrapeResult.error}`);
                  // Fallback to snippet if scrape fails
                  searchResultsText += `Snippet for query "${query}" from ${url}:\n${searchResult.results![index].snippet}\n\n---\n\n`;
              }
          });

      } else {
           debugLog.push(`[WARN] No results found for query: "${query}". Error: ${searchResult.error || 'N/A'}`);
      }
  }
  
  if (!searchResultsText.trim()) {
    debugLog.push('[FAIL] No information found from any web search or scrape.');
    return []; // Return empty array if no search results at all
  }
  
  try {
    debugLog.push(`[INFO] Passing ${searchResultsText.length} characters of scraped text and snippets to the AI for analysis.`);
    const result = await discoverTransportOptionsFlow({ fromCity, toCity, searchResultsText });
    debugLog.push(`[SUCCESS] AI analysis complete. Found ${result.length} transport options.`);
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
        searchResultsText: z.string().describe("The full scraped text from multiple web search results containing transport information."),
    }),
    outputSchema: DiscoverTransportOptionsOutputSchema,
  },
  async ({ fromCity, toCity, searchResultsText }) => {

    const { output } = await ai.generate({
        prompt: `
          You are an expert travel agent and research analyst. Your task is to analyze the provided web page content and extract structured information about transportation options from ${fromCity} to ${toCity}.
          
          Analyze the following research packet, which contains content scraped from multiple relevant webpages:
          ---
          ${searchResultsText}
          ---
          
          Based ONLY on the text provided, generate a list of transport options. For each option, you MUST provide:
          - The type of transport (e.g., flight, bus, train, ride-sharing, ferry).
          - The full name of the company or provider (e.g., 'AirAsia', 'Plusliner', 'KTM Berhad', 'Grab'). If you see "e-hailing", identify if it is Grab or another service.
          - An estimated travel time, including a range if possible (e.g., '1 hour', '4-5 hours').
          - A typical price range in USD. If you find a single price in a local currency (e.g., "RM 35"), do a rough conversion and present it as a small range (e.g., if RM35 is ~$8 USD, return "$8 - $10 USD").
          - A direct URL for booking if available in the text. Prioritize direct provider links over aggregators if possible.
          
          CRITICAL INSTRUCTIONS:
          1.  DO NOT invent information. If a specific detail (like company, time, or price) is truly not present in the provided text, use "Check Online".
          2.  **QUALITY GATE**: If you cannot find a specific company name for a transport option, DISCARD that option entirely. Do not create an entry with "Company: Not Available".
          3.  Synthesize information. If one source mentions a price and another mentions the travel time for the same service, combine them into one complete entry.
        `,
        model: 'googleai/gemini-1.5-pro',
        output: {
            schema: z.array(TransportOptionSchema),
        }
    });
    
    return output!;
  }
);
