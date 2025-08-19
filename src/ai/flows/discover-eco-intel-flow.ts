
'use server';
/**
 * @fileOverview A Genkit flow to discover and structure eco-intelligence data for a given country.
 *
 * This flow acts as a research agent. Given a country name, it uses a live web search
 * tool to find relevant government agencies and NGOs, then analyzes the results to
 * extract structured data about eco-friendly opportunities.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { DiscoverEcoIntelInputSchema, DiscoverEcoIntelOutputSchema, type DiscoverEcoIntelInput, type DiscoverEcoIntelOutput } from './types';
import { searchWebTool } from '@/actions/search';


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The country name to discover data for.
 * @param debugLog A logger to track the agent's progress.
 * @returns A promise that resolves to the structured country eco-intel data.
 */
export async function discoverEcoIntel(input: DiscoverEcoIntelInput, debugLog: (log: string) => void): Promise<DiscoverEcoIntelOutput> {
    // This function now directly calls and returns the result of the flow,
    // allowing any errors to be propagated up to the calling server action,
    // which has its own robust error handling.
    return discoverEcoIntelFlow({ countryName: input.countryName, debugLog });
}

// --- Genkit Flow and Prompt Definitions ---

const discoverEcoIntelFlow = ai.defineFlow(
  {
    name: 'discoverEcoIntelFlow',
    inputSchema: DiscoverEcoIntelInputSchema.extend({ debugLog: z.custom<(log: string) => void>() }),
    outputSchema: DiscoverEcoIntelOutputSchema,
  },
  async ({ countryName, debugLog }) => {
    
    debugLog(`[AGENT] Starting research for ${countryName}.`);
    
    const { output } = await ai.generate({
      prompt: `
        You are an expert environmental and geopolitical research analyst. 
        Your task is to use the provided web search tool to build a detailed profile of the key environmental organizations in **${countryName}**.

        **CRITICAL INSTRUCTIONS:**

        1.  **GOVERNMENT BODIES:**
            *   Execute a web search to identify the primary national-level government ministries, agencies, and departments responsible for:
                *   Environmental policy and protection
                *   Forestry management and conservation
                *   Climate change adaptation
            *   Use a targeted search query like: \`(ministry OR department OR agency) of (environment OR forestry OR climate change) official site in ${countryName}\`

        2.  **NON-GOVERNMENTAL ORGANIZATIONS (NGOs):**
            *   Execute another web search to find the most prominent and active NGOs in ${countryName} that focus on hands-on environmental work, specifically:
                *   Tree planting and reforestation
                *   Wildlife conservation
                *   Community recycling programs
            *   Use a targeted search query like: \`top environmental NGOs for (tree planting OR conservation OR recycling) in ${countryName}\`

        3.  **ANALYZE & EXTRACT:**
            *   From the search results, carefully analyze the titles and snippets.
            *   For each relevant organization you identify, extract its official name, its primary responsibility or focus area, and its full, official website URL.
            *   **URL Requirement**: You MUST find a valid, direct URL for each organization. If you cannot find an official URL for an organization, DISCARD it from the results. Do not include any entry with an empty or placeholder URL.

        4.  **FORMAT OUTPUT:**
            *   Populate the \`governmentBodies\` and \`ngos\` arrays with the extracted information.
            *   If you cannot find any verifiable organizations in a category, return an empty array for it. **Do not invent information.**
            *   Determine the geopolitical region for ${countryName}.
      `,
      model: 'googleai/gemini-1.5-pro',
      tools: [searchWebTool],
      output: {
        schema: DiscoverEcoIntelOutputSchema,
      },
    });

    if (!output) {
      debugLog(`[FAIL] AI generation returned a null or undefined output for ${countryName}.`);
      throw new Error("AI failed to generate a valid response.");
    }
    
    debugLog('[SUCCESS] AI analysis complete. Returning structured output.');
    return output;
  }
);
