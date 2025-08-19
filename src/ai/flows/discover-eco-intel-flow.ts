
'use server';
/**
 * @fileOverview A Genkit flow to discover and structure eco-intelligence data for a given country.
 *
 * This flow now acts as a pure analysis engine. It receives a pre-compiled "research packet"
 * of text snippets from web searches and extracts structured data from it.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { DiscoverEcoIntelInputSchema, DiscoverEcoIntelOutputSchema, type DiscoverEcoIntelInput, type DiscoverEcoIntelOutput } from './types';


// --- Main Exported Function ---

export async function discoverEcoIntel(input: DiscoverEcoIntelInput): Promise<DiscoverEcoIntelOutput> {
  return discoverEcoIntelFlow(input);
}

// --- Genkit Flow and Prompt Definitions ---

const discoverEcoIntelFlow = ai.defineFlow(
  {
    name: 'discoverEcoIntelFlow',
    inputSchema: DiscoverEcoIntelInputSchema,
    outputSchema: DiscoverEcoIntelOutputSchema,
  },
  async ({ countryName, researchPacket }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are an expert environmental and geopolitical research analyst. 
        Your task is to analyze the provided research packet and extract a detailed profile of the key environmental organizations in **${countryName}**.

        **Research Packet:**
        ---
        ${researchPacket}
        ---

        **CRITICAL INSTRUCTIONS:**

        1.  **Analyze & Extract:** From the provided text snippets, identify government ministries/agencies and non-governmental organizations (NGOs).
        2.  For each organization you identify, you MUST extract its **official name**, its **primary responsibility** or focus area, and its **full, official website URL** from the text.
        3.  **URL Requirement**: You MUST find a valid, direct URL for each organization in the provided text. If an official URL is not present in the snippets for an organization, DISCARD it. Do not include any entry with an empty, placeholder, or incomplete URL.
        4.  **Format Output:** Populate the \`governmentBodies\` and \`ngos\` arrays with the extracted information. If you cannot find any verifiable organizations with URLs in a category, return an empty array for it. Do not invent information.
        5.  Determine the geopolitical region for ${countryName}.
      `,
      model: 'googleai/gemini-1.5-pro',
      output: {
        schema: DiscoverEcoIntelOutputSchema,
      },
    });

    if (!output) {
      throw new Error("AI analysis failed to generate a valid response.");
    }
    
    return output;
  }
);
