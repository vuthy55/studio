
'use server';
/**
 * @fileOverview A Genkit flow to discover and structure intelligence data for a given country.
 *
 * This flow acts as a research agent. Given a country name, it uses a large language model
 * to determine the country's geopolitical region, its neighboring countries, and a curated
 * list of reputable English-language news sources for both the local country and its broader region.
 *
 * This flow is designed to be called by an administrative function, such as a "database builder,"
 * to programmatically populate a knowledge base (like a Firestore collection) with high-quality,
 * structured data for later use by other AI agents or application features.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { lightweightCountries } from '@/lib/location-data';
import { DiscoverCountryDataInputSchema, DiscoverCountryDataOutputSchema, type DiscoverCountryDataInput, type DiscoverCountryDataOutput } from './types';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The country name to discover data for.
 * @returns A promise that resolves to the structured country intelligence data.
 */
export async function discoverCountryData(input: DiscoverCountryDataInput): Promise<DiscoverCountryDataOutput> {
  const result = await discoverCountryDataFlow(input);

  // Post-processing to ensure neighbor codes are valid
  if (result.neighbours) {
    const validCodes = new Set(lightweightCountries.map(c => c.code));
    result.neighbours = result.neighbours.filter(code => validCodes.has(code));
  }

  return result;
}

// --- Genkit Flow and Prompt Definitions ---

const discoverCountryDataFlow = ai.defineFlow(
  {
    name: 'discoverCountryDataFlow',
    inputSchema: DiscoverCountryDataInputSchema,
    outputSchema: DiscoverCountryDataOutputSchema,
  },
  async ({ countryName }) => {
    
    // Find the country code to help the AI be more specific
    const countryInfo = lightweightCountries.find(c => c.name.toLowerCase() === countryName.toLowerCase());
    const countryCode = countryInfo?.code || 'Unknown';

    const { output } = await ai.generate({
      prompt: `
        You are a geopolitical research assistant. Your task is to populate a database with key information about a country.
        For the country "${countryName}" (ISO Code: ${countryCode}), provide the following information in the requested format:
        
        1.  **region**: The main geopolitical region (e.g., "South East Asia", "Western Europe").
        2.  **neighbours**: A list of ISO 3166-1 alpha-2 codes for every country that shares a direct land border.
        3.  **regionalNews**: A list of 3-4 major, reputable, English-language news outlets that provide significant coverage of that specific region. Provide only the root domain (e.g., "reuters.com", "aljazeera.com").
        4.  **localNews**: A list of 2-3 of the most reputable, English-language local news outlets based in that specific country. Provide only the root domain (e.g., "bangkokpost.com").
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverCountryDataOutputSchema,
      },
    });

    return output!;
  }
);
