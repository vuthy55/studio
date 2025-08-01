
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

// --- Zod Schemas for Input/Output ---

export const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
export type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const HolidaySchema = z.object({
  name: z.string().describe('The name of the holiday or festival.'),
  date: z.string().describe('The typical date or date range (e.g., "Late January", "April 13-15").'),
  description: z.string().describe('A brief description of the event.'),
});

export const CountryIntelSchema = z.object({
  majorHolidays: z.array(HolidaySchema).describe('A list of 3-5 major public holidays or vibrant festivals.'),
  culturalEtiquette: z.array(z.string()).describe('A list of 3-5 crucial cultural etiquette tips for travelers (e.g., how to greet, dress code for temples, tipping customs).'),
  commonScams: z.array(z.string()).describe('A list of 2-3 common travel scams specific to this country that tourists should be aware of.'),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Genkit Flow Definition ---

const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName }) => {
    const prompt = `
        You are a seasoned travel expert specializing in providing concise, practical advice for backpackers.
        For the country of ${countryName}, generate a travel advisory. Focus on information that is highly relevant to a first-time visitor or backpacker.

        Provide the output in a structured format.
        - For holidays, focus on the most significant or visually interesting ones.
        - For etiquette, provide actionable tips.
        - For scams, describe common scenarios clearly.
    `;

    try {
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: CountryIntelSchema },
        });
        return output!;
    } catch (error) {
        console.error(`[AI Flow] Error generating intel for ${countryName}:`, error);
        // Fallback or rethrow a more user-friendly error
        throw new Error(`The AI model could not generate travel information for ${countryName}. It might be a restricted or unsupported location.`);
    }
  }
);

// --- Main Exported Function ---

/**
 * Main exported function that wraps and calls the Genkit flow.
 */
export async function getCountryIntel(input: GetCountryIntelInput): Promise<CountryIntel> {
  return getCountryIntelFlow(input);
}
