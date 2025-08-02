
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
  isAseanCountry: z.boolean().describe('Whether the country is a member of ASEAN.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const HolidaySchema = z.object({
  name: z.string().describe('The name of the holiday or festival.'),
  date: z.string().describe('The typical date or date range (e.g., "Late January", "April 13-15").'),
  description: z.string().describe('A brief description of the event.'),
  link: z.string().optional().describe('A URL to a Wikipedia or official page about the event, if available.'),
});

// Schema for the "advisory-only" AI call for ASEAN countries
const AseanIntelSchema = z.object({
  latestAdvisory: z.array(z.string()).describe("A list of 2-3 of the most recent, urgent travel advisories, scams, or relevant news for this country. Focus on information from the last 6 months. If none, state that there are no major recent advisories."),
});

// Full schema for non-ASEAN countries
const CountryIntelSchema = AseanIntelSchema.extend({
  majorHolidays: z.array(HolidaySchema).describe('A list of 3-5 major public holidays or vibrant festivals.'),
  culturalEtiquette: z.array(z.string()).describe('A list of 3-5 crucial cultural etiquette tips for travelers (e.g., how to greet, dress code for temples, tipping customs).'),
  visaInfo: z.string().describe("A brief, general overview of the tourist visa policy for common nationalities (e.g., 'Visa on arrival available for 30 days for many nationalities, e-visa recommended')."),
  emergencyNumbers: z.object({
    police: z.string().describe("The primary police emergency number."),
    ambulance: z.string().describe("The primary ambulance or medical emergency number."),
    fire: z.string().describe("The primary fire emergency number."),
    touristPolice: z.string().optional().describe("The specific tourist police number, if it exists."),
  }),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---

/**
 * Main exported function that wraps and calls the Genkit flow.
 * Returns a partial object for ASEAN countries (advisory only) or a full object for others.
 */
export async function getCountryIntel(input: { countryName: string; isAseanCountry: boolean }): Promise<Partial<CountryIntel>> {
  return getCountryIntelFlow(input);
}


const generateWithFallback = async (prompt: string, schema: z.ZodType) => {
    try {
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema },
        });
    } catch (error) {
        console.warn(`[AI Flow] Primary model (gemini-1.5-flash) failed for country intel. Retrying with fallback.`, error);
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-pro',
            output: { schema },
        });
    }
};

const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: z.union([CountryIntelSchema, AseanIntelSchema]),
  },
  async ({ countryName, isAseanCountry }) => {
    let prompt: string;
    let schema: z.ZodType;

    if (isAseanCountry) {
        // More targeted prompt for ASEAN countries
        prompt = `
            You are a travel security expert providing urgent, up-to-the-minute travel advisories.
            For the ASEAN country of ${countryName}, what are the 2-3 most critical pieces of information a backpacker needs to know right now?
            Focus only on information from the last 6 months. This includes new scams, political instability affecting tourists, health notices, or major transport disruptions.
            If there are no major recent advisories, state that clearly.
        `;
        schema = AseanIntelSchema;
    } else {
        // The original, comprehensive prompt for non-ASEAN countries
        prompt = `
            You are a seasoned travel expert specializing in providing concise, practical, and up-to-date advice for backpackers.
            For the country of ${countryName}, generate a comprehensive travel advisory.

            Provide the output in a structured format with the following sections:
            - latestAdvisory: Focus on actionable, recent information (last 6 months). This is the most critical section. Mention scams, political situations, or health notices relevant to a tourist.
            - majorHolidays: List the most significant or visually interesting ones.
            - culturalEtiquette: Provide actionable tips.
            - visaInfo: Give a general, non-legally-binding overview for common tourist nationalities.
            - emergencyNumbers: Provide the main numbers. If a specific tourist police number exists, include it.
        `;
        schema = CountryIntelSchema;
    }


    try {
        const { output } = await generateWithFallback(prompt, schema);
        return output!;
    } catch (error) {
        console.error(`[AI Flow] CRITICAL: Both models failed to generate intel for ${countryName}:`, error);
        throw new Error(`The AI model could not generate travel information for ${countryName}. It might be a restricted or unsupported location.`);
    }
  }
);
