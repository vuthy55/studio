

'use server';
/**
 * @fileOverview A Genkit flow to discover and structure eco-intelligence data for a given country.
 *
 * This flow acts as a research agent. Given a country name, it uses a large language model
 * to find reputable carbon calculation sources and local offsetting opportunities.
 *
 * This flow is designed to be called by an administrative function ("database builder") to
 * programmatically populate a knowledge base (Firestore) with high-quality, structured data.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { DiscoverEcoIntelInputSchema, DiscoverEcoIntelOutputSchema, type DiscoverEcoIntelInput, type DiscoverEcoIntelOutput } from './types';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The country name to discover data for.
 * @returns A promise that resolves to the structured country eco-intel data.
 */
export async function discoverEcoIntel(input: DiscoverEcoIntelInput): Promise<DiscoverEcoIntelOutput> {
  const result = await discoverEcoIntelFlow(input);
  return result;
}

// --- Genkit Flow and Prompt Definitions ---

const discoverEcoIntelFlow = ai.defineFlow(
  {
    name: 'discoverEcoIntelFlow',
    inputSchema: DiscoverEcoIntelInputSchema,
    outputSchema: DiscoverEcoIntelOutputSchema,
  },
  async ({ countryName }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are an environmental research assistant. Your task is to populate a database with eco-intelligence for travelers for the country "${countryName}".

        1.  **calculationSources**: Find 2-3 globally recognized and authoritative websites for calculating travel-related carbon footprints (flights, transport, etc.). Examples include government agencies, IGOs like ICAO, or well-regarded environmental organizations. Provide only the root domain (e.g., "carbonfootprint.com").
        
        2.  **offsettingOpportunities**: Find 3-5 specific, reputable organizations or projects within "${countryName}" that offer environmental volunteer opportunities or carbon offsetting programs. For each, provide:
            *   **name**: The official name of the organization or project.
            *   **url**: The direct URL to their homepage or volunteer page.
            *   **description**: A one-sentence summary of their mission or the type of work they do.
            *   **activityType**: Categorize the main activity as one of: 'tree_planting', 'coral_planting', 'recycling', 'conservation', 'other'.
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverEcoIntelOutputSchema,
      },
    });

    return output!;
  }
);
