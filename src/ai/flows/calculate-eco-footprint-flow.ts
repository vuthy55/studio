
'use server';
/**
 * @fileOverview A Genkit flow to calculate the carbon footprint of a journey.
 *
 * This flow acts as a research agent. Given a user's travel story, it uses tools to
 * break down the journey, calculate the carbon footprint for each segment,
 * and suggest localized offsetting opportunities based on a curated database.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { EcoFootprintInputSchema, EcoFootprintOutputSchema, type EcoFootprintInput, type EcoFootprintOutput } from './types';
import { getAppSettingsAction } from '@/actions/settings';
import { getCountryEcoIntel } from '@/actions/eco-intel';

// --- Genkit Tools ---

const getFlightCarbonData = ai.defineTool(
  {
    name: 'get_flight_carbon_data',
    description: 'Calculates the carbon footprint for a single flight leg between two airport codes (e.g., KUL to REP).',
    inputSchema: z.object({
        fromAirportCode: z.string().describe("The IATA code of the departure airport, e.g., 'KUL'."),
        toAirportCode: z.string().describe("The IATA code of the arrival airport, e.g., 'REP'."),
        calculationSources: z.array(z.string()).describe("A list of trusted source domains (e.g., 'icao.int') to use for the web search.")
    }),
    outputSchema: z.number().describe("The estimated carbon footprint in kg CO2."),
  },
  async (input) => {
    // In a real implementation, this would call a dedicated flight carbon API.
    // For this test, we will use a web search against trusted sources.
    const searchSites = input.calculationSources.map(s => `site:${s.trim()}`).join(' OR ');
    
    const query = `carbon footprint flight ${input.fromAirportCode} to ${input.toAirportCode} ${searchSites}`;
    
    const searchResult = await searchWebAction({ query });

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
        description: 'Calculates the carbon footprint for ground transport like taxis, buses, or trains based on distance.',
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
  async ({ travelDescription, destinationCountryCode, debugLog }) => {
    
    debugLog.push(`[INFO] Flow started. Fetching settings and Eco Intel for country: ${destinationCountryCode}`);
    const appSettings = await getAppSettingsAction();
    const ecoIntelData = await getCountryEcoIntel(destinationCountryCode);
    
    if (!ecoIntelData) {
        throw new Error(`Eco-intelligence data for country code "${destinationCountryCode}" has not been built yet. Please ask an administrator to build it.`);
    }

    const calculationSources = (appSettings.ecoFootprintCalculationSources || '').split(',').map(s => s.trim()).filter(Boolean);
    
    // Standardize the two different opportunity types into one consistent structure.
    const mappedOffsettingOpportunities = (ecoIntelData.offsettingOpportunities || []).map(o => ({
        name: o.name,
        url: o.url || '',
        description: o.responsibility, // Map 'responsibility' to 'description'
        activityType: o.activityType || 'offsetting', // Provide a default 'activityType'
    }));

    const mappedTourismOpportunities = (ecoIntelData.ecoTourismOpportunities || []).map(o => ({
        name: o.name,
        url: o.bookingUrl || '',
        description: o.description, // Use 'description' directly
        activityType: o.category || 'tourism', // Map 'category' to 'activityType'
    }));

    const allLocalOpportunities = [...mappedOffsettingOpportunities, ...mappedTourismOpportunities];


    debugLog.push(`[INFO] Using ${calculationSources.length} global calculation sources.`);
    debugLog.push(`[INFO] Found ${allLocalOpportunities.length} local opportunities from the database.`);
    
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
          *   For flights, you MUST use the \`get_flight_carbon_data\` tool and pass it the required calculation sources.
          *   For ground transport, you MUST estimate the distance and use the \`get_ground_transport_carbon_data\` tool. A typical intra-city trip is 10-20km. An airport transfer is 50-70km.
      3.  **Assume Standard Values:**
          *   For each night in a hotel, assume a footprint of 15 kg CO2.
          *   For each day of travel, assume 3 meals with a total footprint of 5 kg CO2.
      4.  **Format the Output:**
          *   Sum all individual footprints to get the \`totalFootprintKgCo2\`.
          *   List each calculated item in the \`breakdown\` array.
          *   Provide a clear \`methodology\` explaining the assumptions you made.
          *   Use the total footprint to suggest a simple, tangible offsetting action in \`offsetSuggestion\`. (Assume 1 tree offsets 25 kg CO2 per year).
          *   List the trusted source websites you were told to use in the \`references\` field. You MUST format each reference as a full, valid URL (e.g., 'https://www.icao.int').
          *   Populate the \`localOpportunities\` field with the curated list of opportunities provided below.
      
      **Constraint:** When searching for calculation data, you may only refer to information from these trusted sources: ${calculationSources.join(', ')}.

      **Curated Local Offsetting & Eco-Tourism Opportunities (use this data, do not search for new ones):**
      ---
      ${JSON.stringify(allLocalOpportunities, null, 2)}
      ---
      `,
      model: 'googleai/gemini-1.5-pro',
      tools: [getFlightCarbonData, getGroundTransportCarbonData],
      toolConfig: {
        // Pass calculation sources to all tools that might need it
        custom: (tool) => {
          if (tool.name === 'get_flight_carbon_data') {
            return { calculationSources };
          }
        },
      },
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
