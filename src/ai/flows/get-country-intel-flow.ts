
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow uses tools to perform web searches and scrape content.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { performWebSearch, scrapeUrl } from '@/ai/tools/web-research';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const HolidaySchema = z.object({
  name: z.string().describe('The name of the holiday or festival.'),
  date: z.string().describe('The typical date or date range (e.g., "Late January", "April 13-15").'),
  description: z.string().describe('A brief description of the event.'),
  link: z.string().optional().describe('A source URL if available.'),
});

const CountryIntelSchema = z.object({
  latestAdvisory: z.array(z.object({
    advisory: z.string().describe("A single, specific travel advisory, scam, or relevant news item."),
    source: z.string().describe("The source URL from which the advisory was obtained."),
  })).describe("A list of 2-3 of the most recent and urgent travel advisories for this country, based on the provided web content. Each advisory must cite its source URL."),
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
    tools: [performWebSearch, scrapeUrl]
  },
  async ({ countryName }) => {
    const prompt = `
        You are a Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.
        
        **Process:**
        1.  First, use the 'performWebSearch' tool to find 3-4 recent articles about travel advisories, news, or scams for ${countryName}.
        2.  Next, use the 'scrapeUrl' tool on each of the URLs you found to get their content.
        3.  Finally, synthesize all the information you have gathered to generate the output in the required JSON format.

        **Output Formatting Rules:**
        -   **latestAdvisory:** Your response for this field MUST be based on the content from the scraped web pages. List only the most critical and recent travel advisories. For each advisory, you MUST cite the specific source URL where you found the information.
        -   **Other Fields (Holidays, Etiquette, etc.):** Fill these out using your own internal knowledge. You do not need to use tools for these fields.
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
           throw new Error("The AI model returned an empty output. This may be due to a lack of recent news or a content safety filter.");
        }
        return output;

    } catch (error: any) {
        console.error(`[AI Flow] CRITICAL: Model failed to generate intel for ${countryName}. Full error:`, error);
        throw new Error(`The AI agent could not generate travel information for ${countryName}. Reason: ${error.message}`);
    }
  }
);
