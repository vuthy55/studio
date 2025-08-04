
'use server';
/**
 * @fileOverview A Genkit flow to discover and structure intelligence data for a given country.
 *
 * This flow acts as a research agent. Given a country name, it uses a large language model
 * to determine the country's geopolitical region, its neighboring countries, a curated
 * list of reputable news sources, and key static travel information like visa requirements,
 * etiquette, major holidays, and emergency numbers.
 *
 * This flow is designed to be called by an administrative function ("database builder") to
 * programmatically populate a knowledge base (Firestore) with high-quality, structured data.
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
        You are a geopolitical and travel research assistant. Your task is to populate a database with key information about a country.
        For the country "${countryName}" (ISO Code: ${countryCode}), provide the following information in the requested format. BE ACCURATE and CONCISE.

        1.  **countryName**: The official name of the country, matching the input.
        2.  **region**: The main geopolitical region (e.g., "South East Asia", "Western Europe").
        3.  **neighbours**: A list of ISO 3166-1 alpha-2 codes for every country that shares a direct land border. If it's an island nation with no land borders, return an empty list.
        4.  **regionalNews**: A list of 3-4 major, reputable, English-language news outlets that provide significant coverage of that specific region. Provide only the root domain (e.g., "reuters.com", "aljazeera.com").
        5.  **localNews**: A list of 2-3 of the most reputable, English-language local news outlets based in that specific country. Provide only the root domain (e.g., "bangkokpost.com").
        6.  **visaInformation**: A brief, one-sentence summary of the general tourist visa policy (e.g., "Many nationalities receive a 30-day visa exemption on arrival.").
        7.  **etiquette**: A list of 3-4 bullet points of the most important cultural etiquette for travelers (e.g., "Always show respect for the King.").
        8.  **publicHolidays**: A list of 3-5 of the most significant national public holidays or major festivals, with their approximate dates (e.g., "Songkran (Thai New Year) - mid-April").
        9.  **emergencyNumbers**: A list containing the national numbers for Police, Ambulance, and Fire.
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverCountryDataOutputSchema,
      },
    });

    return output!;
  }
);

    