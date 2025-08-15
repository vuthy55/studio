
'use server';
/**
 * @fileOverview A server action to securely expose transport-related AI flows to the client.
 */
import { discoverTransportOptions } from '@/ai/flows/discover-transport-options-flow';
import type { DiscoverTransportOptionsInput, TransportOption } from '@/ai/flows/types';


/**
 * Server action wrapper for the discoverTransportOptions Genkit flow.
 * @param input The from/to cities and country.
 * @returns A promise that resolves to an array of transport options and a debug log.
 */
export async function getTransportOptionsAction(input: DiscoverTransportOptionsInput): Promise<{ options: TransportOption[]; debugLog: string[] }> {
    return discoverTransportOptions(input);
}
