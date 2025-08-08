
'use server';
/**
 * @fileOverview A server action to securely expose location-based AI flows to the client.
 */
import { getCityFromCoords } from '@/ai/flows/get-city-from-coords-flow';
import type { GetCityFromCoordsInput, GetCityFromCoordsOutput } from '@/ai/flows/types';


/**
 * Server action wrapper for the getCityFromCoords Genkit flow.
 * @param input The latitude and longitude.
 * @returns A promise that resolves to the city and country name.
 */
export async function getCityFromCoordsAction(input: GetCityFromCoordsInput): Promise<GetCityFromCoordsOutput> {
    return getCityFromCoords(input);
}
