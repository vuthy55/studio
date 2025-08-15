
'use server';
/**
 * @fileOverview A Genkit flow to discover and structure transport provider data for a given country.
 *
 * This flow acts as a research agent. Given a country name, it uses a large language model
 * to find reputable transport providers for local and regional travel.
 *
 * This flow is designed to be called by an administrative function ("database builder") to
 * programmatically populate a knowledge base (Firestore) with high-quality, structured data.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { DiscoverTransportProvidersInputSchema, DiscoverTransportProvidersOutputSchema, type DiscoverTransportProvidersInput, type DiscoverTransportProvidersOutput } from './types';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The country name to discover data for.
 * @returns A promise that resolves to the structured country transport data.
 */
export async function discoverTransportProviders(input: DiscoverTransportProvidersInput): Promise<DiscoverTransportProvidersOutput> {
  const result = await discoverTransportProvidersFlow(input);
  return result;
}

// --- Genkit Flow and Prompt Definitions ---

const discoverTransportProvidersFlow = ai.defineFlow(
  {
    name: 'discoverTransportProvidersFlow',
    inputSchema: DiscoverTransportProvidersInputSchema,
    outputSchema: DiscoverTransportProvidersOutputSchema,
  },
  async ({ countryName }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are a travel research assistant specializing in transportation logistics. 
        For the country "${countryName}", your task is to identify and provide a list of key transport providers. 
        Return ONLY the root domain for each provider (e.g., "airasia.com", "grab.com", "ktmb.com.my"). Do not include "https://" or any sub-paths.

        1.  **regionalTransportProviders**: Find 3-5 major airlines that offer extensive regional flights from the main international airports in "${countryName}". Include both budget and full-service carriers where applicable.
        2.  **localTransportProviders**: Find 3-5 of the most popular and reliable providers for domestic travel within "${countryName}". This MUST include:
            - The primary national railway service, if one exists (e.g., for trains, MRT, LRT, monorail).
            - The most popular inter-city bus companies.
            - The dominant ride-sharing apps (like Grab or the local equivalent).
            - Any well-known ferry services if inter-island travel is common.
            - Reputable online travel agencies (OTAs) that are popular for booking transport within that country (e.g., 12go.asia, easybook.com).
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverTransportProvidersOutputSchema,
      },
    });

    return output!;
  }
);
