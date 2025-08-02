
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
  majorHolidays: z.array(HolidaySchema).describe('A comprehensive list of all major public holidays and significant festivals for the entire year.'),
  culturalEtiquette: z.array(z.string()).describe('A detailed list of 5-7 crucial cultural etiquette tips for travelers (e.g., how to greet, dress code for temples, tipping customs, dining etiquette).'),
  visaInfo: z.string().describe("A comprehensive, general overview of the tourist visa policy for common nationalities (e.g., USA, UK, EU, Australia). Mention visa on arrival, e-visa options, and typical durations. Include a source link if possible."),
  emergencyNumbers: z.object({
    police: z.string().describe("The primary police emergency number."),
    ambulance: z.string().describe("The primary ambulance or medical emergency number."),
    fire: z.string().describe("The primary fire emergency number."),
    touristPolice: z.string().optional().describe("The specific tourist police number, if it exists."),
    policeEmail: z.string().optional().describe("A public contact email for the police service, if available."),
    touristPoliceEmail: z.string().optional().describe("A public contact email for the tourist police, if available."),
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
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema },
        });
        if (!output) {
           throw new Error("Primary model returned an empty output.");
        }
        return output;
    } catch (error) {
        console.warn(`[AI Flow] Primary model (gemini-1.5-flash) failed for country intel. Retrying with fallback.`, error);
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-pro',
            output: { schema },
        });
         if (!output) {
           throw new Error("Fallback model also returned an empty output.");
        }
        return output;
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
    
    // Trusted sources for the AI to reference
    const sources = "UN Department of Safety and Security, US Travel Advisory, Australian Smartraveller, European Union travel advisories, CNN, Reuters, Channel NewsAsia, CGTN, and UK government travel advice.";

    if (isAseanCountry) {
        // More targeted prompt for ASEAN countries - only get the latest advisories
        prompt = `
            Act as a travel security analyst. Synthesize a list of the 2-3 most critical and recent travel advisories for tourists visiting ${countryName}.
            Your information must be based on data from the last 3-6 months from the following trusted sources: ${sources}.
            Focus on new scams, political instability affecting tourists, significant health notices, or major transport disruptions.
            If there are no major recent advisories from these sources, state that clearly.
        `;
        schema = AseanIntelSchema;
    } else {
        // The comprehensive prompt for non-ASEAN countries
        prompt = `
            Act as a seasoned travel expert preparing a comprehensive briefing document for a backpacker visiting ${countryName}. 
            Your information must be detailed, actionable, and drawn from sources like ${sources}, as well as official tourism and government websites.
            
            Generate a complete travel profile with the following sections:

            - latestAdvisory: Synthesize the 3-4 most critical and recent (last 6 months) travel advisories. Mention specific scams, safety concerns, health notices, or political situations relevant to tourists.
            - majorHolidays: Provide a comprehensive list of all major public holidays and significant festivals for the entire year. Include the typical date range and a brief description. For at least 2-3 major festivals, provide a source link to a Wikipedia or official tourism page.
            - culturalEtiquette: Detail 5-7 crucial cultural etiquette tips. Go beyond basics; include advice on dress codes for religious sites, dining etiquette, gift-giving, and social interactions.
            - visaInfo: Give a detailed but non-legally-binding overview of tourist visa policies for USA, UK, EU, and Australian citizens. Mention typical visa-free days, e-visa procedures, and possibilities for extension. Provide a link to an official immigration or embassy page if possible.
            - emergencyNumbers: List all key emergency contacts. Include Police, Ambulance, and Fire. Find the specific Tourist Police number if one exists. Also, provide any official public contact emails for these services where available.
        `;
        schema = CountryIntelSchema;
    }


    try {
        const output = await generateWithFallback(prompt, schema);
        return output;
    } catch (error) {
        console.error(`[AI Flow] CRITICAL: Both models failed to generate intel for ${countryName}:`, error);
        throw new Error(`The AI model could not generate travel information for ${countryName}. It might be a restricted or unsupported location.`);
    }
  }
);
