
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow uses the AI's internal knowledge base to generate travel advisories.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const HolidaySchema = z.object({
  name: z.string().describe('The name of the holiday or festival.'),
  date: z.string().describe('The typical date or date range (e.g., "Late January", "April 13-15").'),
  description: z.string().describe('A brief description of the event.'),
});

const CountryIntelSchema = z.object({
  latestAdvisory: z.array(z.object({
    advisory: z.string().describe("A single, specific travel advisory, scam, or relevant news item based on your internal knowledge from the last few months."),
  })).describe("A list of 2-3 of the most recent and urgent travel advisories for this country."),
  majorHolidays: z.array(HolidaySchema).describe('A comprehensive list of all major public holidays and significant festivals for the entire year.'),
  culturalEtiquette: z.array(z.string()).describe('A detailed list of 5-7 crucial cultural etiquette tips for travelers (e.g., how to greet, dress code for temples, tipping customs, dining etiquette).'),
  visaInfo: z.string().describe("A comprehensive, general overview of the tourist visa policy for common nationalities (e.g., USA, UK, EU, Australia). Mention visa on arrival, e-visa options, and typical durations."),
  emergencyNumbers: z.object({
    police: z.string().describe("The primary police emergency number."),
    ambulance: z.string().describe("The primary ambulance or medical emergency number."),
    fire: z.string().describe("The primary fire emergency number."),
    touristPolice: z.string().optional().describe("The specific tourist police number, if it exists."),
  }),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---
export async function getCountryIntel(input: GetCountryIntelInput): Promise<Partial<CountryIntel>> {
  return getCountryIntelFlow(input);
}


// --- Genkit Flow Definition ---
const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName }) => {
    
    const prompt = `
        You are a diligent Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.
        Your response must be based on your internal knowledge. For the 'latestAdvisory' field, prioritize information from the last few months.
    `;
    
    try {
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: CountryIntelSchema },
            config: {
                safetySettings: [
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                ],
            }
        });
        
        if (!output) {
           throw new Error("The AI model returned an empty output. This may be due to a content safety filter.");
        }
        return output;

    } catch (error: any) {
        console.error(`[AI Flow] CRITICAL: Model failed to generate intel for ${countryName}. Full error:`, error);
        throw new Error(`The AI agent could not generate travel information for ${countryName}. Reason: ${error.message}`);
    }
  }
);
