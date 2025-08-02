
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow queries the Gemini model for a travel briefing.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const CountryIntelSchema = z.object({
  latestAdvisory: z.string().optional().describe('A summary of official government travel advisories or notable lack thereof.'),
  scams: z.string().optional().describe('A summary of common tourist scams.'),
  theft: z.string().optional().describe('A summary of theft, robbery, or kidnapping risks.'),
  health: z.string().optional().describe('A summary of health risks or disease outbreaks.'),
  political: z.string().optional().describe('A summary of the political situation, protests, or unrest.'),
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
    
    const { output } = await ai.generate({
        prompt: `You are an expert travel intelligence analyst. Provide a comprehensive travel briefing for ${countryName}. 
        Your information for the 'latestAdvisory' field should be based on your knowledge of events from the last few months.
        For each category, provide a concise summary. If there is no significant information for a category, you can state that.
        `,
        model: 'googleai/gemini-1.5-flash',
        output: { schema: CountryIntelSchema },
    });
    
    return output || {};
  }
);
