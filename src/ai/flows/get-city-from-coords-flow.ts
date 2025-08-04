'use server';
/**
 * @fileOverview A Genkit flow to determine the city for a given set of coordinates.
 *
 * This flow acts as a reverse geocoding agent. It takes latitude and longitude
 * and uses a large language model to identify the corresponding city and country.
 * This is used to notify users of meetups happening in their current city.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

// --- Zod Schemas for Input/Output ---

export const GetCityFromCoordsInputSchema = z.object({
  lat: z.number().describe('The latitude coordinate.'),
  lon: z.number().describe('The longitude coordinate.'),
});
export type GetCityFromCoordsInput = z.infer<typeof GetCityFromCoordsInputSchema>;

export const GetCityFromCoordsOutputSchema = z.object({
  city: z.string().describe('The name of the city for the given coordinates.'),
  country: z.string().describe('The name of the country for the given coordinates.'),
});
export type GetCityFromCoordsOutput = z.infer<typeof GetCityFromCoordsOutputSchema>;


// --- Main Exported Function ---

/**
 * Wraps the Genkit flow, providing a simple async function interface.
 * @param input The latitude and longitude to look up.
 * @returns A promise that resolves to the city and country name.
 */
export async function getCityFromCoords(input: GetCityFromCoordsInput): Promise<GetCityFromCoordsOutput> {
  const result = await getCityFromCoordsFlow(input);
  return result;
}

// --- Genkit Flow and Prompt Definitions ---

const getCityFromCoordsFlow = ai.defineFlow(
  {
    name: 'getCityFromCoordsFlow',
    inputSchema: GetCityFromCoordsInputSchema,
    outputSchema: GetCityFromCoordsOutputSchema,
  },
  async ({ lat, lon }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are a reverse geocoding assistant. Your task is to identify the city and country for the given geographic coordinates.
        Provide only the city and country name. Do not provide province, state, or any other administrative division.

        Coordinates:
        Latitude: ${lat}
        Longitude: ${lon}
      `,
      model: 'googleai/gemini-1.5-flash',
      output: {
        schema: GetCityFromCoordsOutputSchema,
      },
    });

    return output!;
  }
);
