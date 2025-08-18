

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
    curatedSearchSources: result.curatedSearchSources || [],
    offsettingOpportunities: result.offsettingOpportunities || [],
    ecoTourismOpportunities: result.ecoTourismOpportunities || [],
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
        You are an environmental research assistant for a travel app. Your task is to analyze the provided web page content and extract structured information about eco-friendly opportunities in "${countryName}".

        Analyze the following research packet, which contains content scraped from multiple relevant webpages:
        ---
        ${searchResultsText}
        ---

        Based ONLY on the text provided, provide the following information:
        
        1.  **curatedSearchSources**: Identify the URLs of any reputable environmental NGOs, government agencies (like a Ministry of Environment or Department of Forestry), or well-known local environmental communities. Return a list of their root URLs (e.g., "wwf.org.my", "doe.gov.my").

        2.  **offsettingOpportunities**: Find specific, reputable organizations or projects (up to a maximum of 5) that offer environmental volunteer opportunities or carbon offsetting programs. For each, provide:
            *   **name**: The official name of the organization or project.
            *   **url**: The direct URL to their homepage or volunteer page. Must be a full, valid URL.
            *   **description**: A one-sentence summary of their mission or the type of work they do (e.g., "Reforestation projects in the northern highlands", "Marine conservation and coral planting initiatives").
            *   **activityType**: Categorize the main activity as one of: 'tree_planting', 'coral_planting', 'recycling', 'conservation', 'other'.

        3. **ecoTourismOpportunities**: Find specific, reputable eco-tourism activities or locations (up to a maximum of 5). For each, provide:
            *   **name**: The name of the tour, park, or location.
            *   **description**: A one-sentence summary of the activity (e.g., "Jungle trekking to see native wildlife in a protected reserve.").
            *   **category**: Categorize as one of: 'wildlife_sanctuary', 'jungle_trekking', 'community_visit', 'bird_watching', 'other'.
            *   **bookingUrl**: The direct booking URL if available in the text.
        
        **CRITICAL INSTRUCTIONS:**
        1.  If you cannot find any verifiable projects or opportunities after a thorough review of the provided text, it is acceptable and correct to return an empty list for that field.
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
