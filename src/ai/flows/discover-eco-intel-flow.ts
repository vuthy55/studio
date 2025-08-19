
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
        Your task is to analyze the provided research packet and extract a detailed profile of the key environmental organizations and eco-tourism opportunities in **${countryName}**.

        **Research Packet:**
        ---
        ${researchPacket}
        ---

        **CRITICAL INSTRUCTIONS:**

        1.  **Analyze & Extract:** From the provided text snippets, identify government ministries/agencies, non-governmental organizations (NGOs), carbon offsetting projects, and eco-tourism opportunities.
        2.  **URL Requirement for Organizations**: For each organization (government, NGO, offsetting), you MUST find a valid, direct URL in the provided text. If an official URL is not present in the snippets for an organization, DISCARD that organization. Do not include any entry with an empty, placeholder, or incomplete URL.
        3.  **URL Requirement for Eco-Tourism**: For each eco-tourism opportunity, you MUST attempt to find a booking URL. If a valid booking URL is not present in the text, completely OMIT the \`bookingUrl\` field from that opportunity's JSON object.
        4.  **Format Output:** Populate all fields in the requested JSON format. If you cannot find any verifiable entries for a category, return an empty array for it. Do not invent information.
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
    
    // --- Data Sanitization Step ---
    // This is the definitive fix to prevent crashes from invalid AI output.
    // The AI sometimes returns a `bookingUrl: ""` even when instructed not to.
    // This code manually cleans the data before it's returned and validated.
    if (output.ecoTourismOpportunities) {
        output.ecoTourismOpportunities.forEach(opp => {
            if (opp.bookingUrl === "") {
                delete opp.bookingUrl;
            }
        });
    }

    return output;
  }
);


