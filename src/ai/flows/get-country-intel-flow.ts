'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This has been refactored into an AI Agent that uses tools to perform research.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { format } from 'date-fns';
import { webSearch, scrapeWeb } from '@/ai/tools/web-search';
import { getAppSettingsAction } from '@/actions/settings';

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

// Schema for the "advisory-only" AI call for ASEAN countries.
const AseanIntelSchema = z.object({
  latestAdvisory: z.array(z.string()).describe("A list of 2-3 of the most recent, urgent travel advisories, scams, or relevant news for this country, summarized from the provided text. The response must start with 'As of {current_date}:' and only include information from the last month."),
});

// Full schema for non-ASEAN countries, extending the ASEAN schema.
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
export async function getCountryIntel(input: GetCountryIntelInput): Promise<Partial<CountryIntel>> {
  return getCountryIntelFlow(input);
}

const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: z.union([CountryIntelSchema, AseanIntelSchema]),
  },
  async ({ countryName, isAseanCountry }) => {
    
    // Choose the correct schema based on the country type.
    const schema = isAseanCountry ? AseanIntelSchema : CountryIntelSchema;
    const currentDate = format(new Date(), 'MMMM d, yyyy');
    const settings = await getAppSettingsAction();
    const globalSources = settings.infohubSources;

    // A unified prompt to handle both ASEAN and non-ASEAN countries.
    // The model will intelligently skip sections if they are not part of the requested output schema.
    const prompt = `
        You are a Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.
        For the 'latestAdvisory' section, you MUST perform live research using the provided tools.
        For all other sections (if requested by the schema), use your general knowledge.

        **Research Instructions for 'latestAdvisory':**
        1.  **Search:** Use the webSearch tool with queries like "latest travel news and advisories for ${countryName}" and "travel scams ${countryName}" to find relevant, recent articles.
        2.  **Scrape:** Use the scrapeWeb tool on the most promising search result URL AND the following global advisory URLs: ${globalSources}.
        3.  **Summarize:** Based on ALL the text you have gathered, extract and list only 2-3 of the most critical and recent (within the last month) travel advisories. Focus on new scams, political instability affecting tourists, or significant health notices.

        **Output Formatting Rules:**
        -   **latestAdvisory:** Your response for this field MUST begin with the exact phrase: 'As of ${currentDate}:'. If you find no relevant new information, return an empty array for this field.
        -   **majorHolidays:** (If requested) Provide a comprehensive list of all major public holidays and significant festivals for the entire year. Include a source link for at least two major events.
        -   **culturalEtiquette:** (If requested) Detail 5-7 crucial cultural etiquette tips.
        -   **visaInfo:** (If requested) Give a detailed but non-legally-binding overview of tourist visa policies for USA, UK, EU, and Australian citizens. Provide a link to an official immigration or embassy page if possible.
        -   **emergencyNumbers:** (If requested) List all key emergency contacts, including tourist police and any available public emails.
    `;

    try {
        const { output } = await ai.generate({
            prompt,
            // Using a more powerful model better suited for complex reasoning and tool use.
            model: 'googleai/gemini-1.5-pro', 
            tools: [webSearch, scrapeWeb],
            output: { schema },
            config: {
                // Adjust safety settings to allow discussion of potentially sensitive travel advisory topics.
                safetySettings: [
                  {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_ONLY_HIGH',
                  },
                ],
            }
        });
        
        if (!output) {
           throw new Error("The AI model returned an empty output, which is unexpected.");
        }
        return output;

    } catch (error: any) {
        // Log the complete, original error from the AI service for better debugging.
        console.error(`[AI Flow] CRITICAL: Model failed to generate intel for ${countryName}. Full error:`, error);
        // Provide a more descriptive error to the user, including the actual reason if available.
        throw new Error(`The AI agent could not generate travel information for ${countryName}. Reason: ${error.message}`);
    }
  }
);
```