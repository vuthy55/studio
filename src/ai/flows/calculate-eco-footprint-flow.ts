
'use server';
/**
 * @fileOverview A Genkit flow to calculate the carbon footprint of a journey.
 *
 * This flow acts as a research agent. Given a user's travel story, it uses tools to
 * break down the journey, calculate the carbon footprint for each segment,
 * and suggest localized offsetting opportunities.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { getAppSettingsAction } from '@/actions/settings';
import { scrapeUrlAction } from '@/actions/scraper';
import { EcoFootprintInputSchema, EcoFootprintOutputSchema, type EcoFootprintInput, type EcoFootprintOutput } from './types';


// --- Genkit Tools ---

const getFlightCarbonData = ai.defineTool(
  {
    name: 'get_flight_carbon_data',
    description: 'Calculates the carbon footprint for a single flight leg between two airport codes (e.g., KUL to REP).',
    inputSchema: z.object({
        fromAirportCode: z.string().describe("The IATA code of the departure airport, e.g., 'KUL'."),
        toAirportCode: z.string().describe("The IATA code of the arrival airport, e.g., 'REP'."),
    }),
    outputSchema: z.number().describe("The estimated carbon footprint in kg CO2."),
  },
  async (input) => {
    // In a real implementation, this would call a dedicated flight carbon API.
    // For this test, we will use a web search against trusted sources.
    const settings = await getAppSettingsAction();
    const searchSites = settings.ecoFootprintCalculationSources.split(',').map(s => `site:${s.trim()}`).join(' OR ');
    
    const query = `carbon footprint flight ${input.fromAirportCode} to ${input.toAirportCode} ${searchSites}`;
    
    const searchResult = await searchWebAction({ 
        query, 
        apiKey: process.env.GOOGLE_API_KEY!, 
        searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID! 
    });

    if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
        const snippet = searchResult.results[0].snippet;
        const match = snippet.match(/(\d+\.?\d*)\s*kg\s*CO2/i);
        if (match) {
            return parseFloat(match[1]);
        }
    }
    // Fallback for demonstration purposes
    return 150; 
  }
);


const getGroundTransportCarbonData = ai.defineTool(
    {
        name: 'get_ground_transport_carbon_data',
        description: 'Calculates the carbon footprint for ground transport like taxis, buses, or tuk-tuks based on distance.',
        inputSchema: z.object({
            transportType: z.string().describe("The type of ground transport used (e.g., 'taxi', 'bus', 'train', 'tuk-tuk', 'ride-share')."),
            distanceKm: z.number().describe("The estimated distance of the journey in kilometers."),
        }),
        outputSchema: z.number().describe("The estimated carbon footprint in kg CO2."),
    },
    async ({ transportType, distanceKm }) => {
        const factors: Record<string, number> = {
            'taxi': 0.15,
            'bus': 0.03,
            'train': 0.02,
            'tuk-tuk': 0.05
        };

        const lowerCaseType = transportType.toLowerCase();
        let factor = factors['taxi']; // Default to taxi if no match

        if (lowerCaseType.includes('bus')) {
            factor = factors['bus'];
        } else if (lowerCaseType.includes('train')) {
            factor = factors['train'];
        } else if (lowerCaseType.includes('tuk-tuk') || lowerCaseType.includes('remorque')) {
            factor = factors['tuk-tuk'];
        } else if (lowerCaseType.includes('taxi') || lowerCaseType.includes('car') || lowerCaseType.includes('grab')) {
            factor = factors['taxi'];
        }
        
        return distanceKm * factor;
    }
);


const findLocalOffsettingOpportunities = ai.defineTool(
  {
    name: 'find_local_offsetting_opportunities',
    description: 'Finds local environmental or tree-planting volunteer opportunities near a specific city.',
    inputSchema: z.object({
        city: z.string(),
        country: z.string(),
    }),
    outputSchema: z.array(z.object({
        name: z.string(),
        url: z.string().url(),
        snippet: z.string()
    })),
  },
  async ({ city, country }) => {
     const query = `tree planting volunteer opportunities in ${city}, ${country}`;
     const searchResult = await searchWebAction({ 
        query, 
        apiKey: process.env.GOOGLE_API_KEY!, 
        searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID! 
    });
     if (searchResult.success && searchResult.results) {
        return searchResult.results.slice(0, 3).map(r => ({ name: r.title, url: r.link, snippet: r.snippet }));
     }
     return [];
  }
);


// --- Main Exported Function ---
export async function calculateEcoFootprint(input: EcoFootprintInput, debugLog: string[]): Promise<EcoFootprintOutput> {
  return calculateEcoFootprintFlow({ ...input, debugLog });
}


// --- Genkit Flow Definition ---

const calculateEcoFootprintFlow = ai.defineFlow(
  {
    name: 'calculateEcoFootprintFlow',
    inputSchema: EcoFootprintInputSchema.extend({ debugLog: z.custom<string[]>() }),
    outputSchema: EcoFootprintOutputSchema,
  },
  async ({ travelDescription, debugLog }) => {
    
    debugLog.push(`[INFO] Flow started. Fetching settings...`);
    const settings = await getAppSettingsAction();
    const calculationSources = settings.ecoFootprintCalculationSources;
    debugLog.push(`[INFO] Using calculation sources: ${calculationSources}`);
    
    debugLog.push(`[INFO] Calling AI to analyze journey and use tools.`);
    const { output } = await ai.generate({
      prompt: `You are an expert travel carbon footprint analyst. Your task is to analyze the user's travel story and calculate their total carbon footprint in kg CO2.

      **User's Travel Story:**
      ---
      ${travelDescription}
      ---
      
      **Instructions:**
      1.  **Deconstruct the Journey:** Break down the user's story into individual travel segments (flights, taxis, hotels, etc.).
      2.  **Use Tools for Calculation:** For each segment, use the provided tools to get the carbon footprint.
          *   For flights, you MUST use the \`get_flight_carbon_data\` tool.
          *   For ground transport, you MUST estimate the distance and use the \`get_ground_transport_carbon_data\` tool. A typical intra-city trip is 10-20km. An airport transfer is 50-70km.
      3.  **Assume Standard Values:**
          *   For each night in a hotel, assume a footprint of 15 kg CO2.
          *   For each day of travel, assume 3 meals with a total footprint of 5 kg CO2.
      4.  **Find Offsetting Opportunities:** Use the primary city from the travel description to call the \`find_local_offsetting_opportunities\` tool.
      5.  **Summarize and Format:**
          *   Sum all individual footprints to get the \`totalFootprintKgCo2\`.
          *   List each calculated item in the \`breakdown\` array.
          *   Provide a clear \`methodology\` explaining the assumptions you made.
          *   Use the total footprint to suggest a simple, tangible offsetting action in \`offsetSuggestion\`. (Assume 1 tree offsets 25 kg CO2 per year).
          *   List the trusted source websites you were told to use in the \`references\` field.
          
      **Constraint:** When searching for calculation data, you may only refer to information from these trusted sources: ${calculationSources}.
      `,
      model: 'googleai/gemini-1.5-pro',
      tools: [getFlightCarbonData, getGroundTransportCarbonData, findLocalOffsettingOpportunities],
      output: {
        schema: EcoFootprintOutputSchema,
      },
    });

    if (!output) {
      debugLog.push('[FAIL] AI generation returned a null or undefined output.');
      throw new Error("AI failed to generate a valid response.");
    }
    
    debugLog.push('[SUCCESS] AI analysis complete. Returning structured output.');
    return output;
  }
);

