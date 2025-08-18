

'use server';
/**
 * @fileOverview A Genkit flow to discover and structure eco-intelligence data for a given country.
 *
 * This flow acts as a research agent. Given pre-scraped text about a country,
 * it finds and structures local offsetting opportunities.
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
 * @param input The country name and scraped search results to analyze.
 * @returns A promise that resolves to the structured country eco-intel data.
 */
export async function discoverEcoIntel(input: DiscoverEcoIntelInput): Promise<DiscoverEcoIntelOutput> {
  const result = await discoverEcoIntelFlow(input);
  // Ensure the result conforms to the schema, even if the AI returns a null/undefined value
  return {
    countryName: result.countryName,
    region: result.region,
    offsettingOpportunities: result.offsettingOpportunities || [],
  };
}

// --- Genkit Flow and Prompt Definitions ---

const discoverEcoIntelFlow = ai.defineFlow(
  {
    name: 'discoverEcoIntelFlow',
    inputSchema: DiscoverEcoIntelInputSchema,
    outputSchema: DiscoverEcoIntelOutputSchema,
  },
  async ({ countryName, searchResultsText }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are an environmental research assistant. Your task is to analyze the provided web page content and extract structured information about eco-friendly opportunities in "${countryName}".

        Analyze the following research packet, which contains content scraped from multiple relevant webpages:
        ---
        ${searchResultsText}
        ---

        Based ONLY on the text provided, provide the following information:
        
        1.  **offsettingOpportunities**: Find as many specific, reputable organizations or projects as you can (up to a maximum of 5) that offer environmental volunteer opportunities or carbon offsetting programs. For each, provide:
            *   **name**: The official name of the organization or project.
            *   **url**: The direct URL to their homepage or volunteer page. Must be a full, valid URL.
            *   **description**: A one-sentence summary of their mission or the type of work they do (e.g., "Reforestation projects in the northern highlands", "Marine conservation and coral planting initiatives").
            *   **activityType**: Categorize the main activity as one of: 'tree_planting', 'coral_planting', 'recycling', 'conservation', 'other'.
        
        **CRITICAL INSTRUCTIONS:**
        1.  If you cannot find any verifiable projects after a thorough review of the provided text, it is acceptable and correct to return an empty list for \`offsettingOpportunities\`.
        2.  Do not invent information. All data must be sourced from the text provided.
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverEcoIntelOutputSchema,
      },
    });

    return output!;
  }
);
