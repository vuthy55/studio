
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow now orchestrates web search and scraping as separate server actions.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { format } from 'date-fns';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const HolidaySchema = z.object({
  name: z.string().describe('The name of the holiday or festival.'),
  date: z.string().describe('The typical date or date range (e.g., "Late January", "April 13-15").'),
  description: z.string().describe('A brief description of the event.'),
  link: z.string().optional().describe('A URL to a Wikipedia or official page about the event, if available.'),
});

const CountryIntelSchema = z.object({
  latestAdvisory: z.array(z.object({
    advisory: z.string().describe("A single, specific travel advisory, scam, or relevant news item."),
    source: z.string().describe("The source URL where this specific advisory was found."),
  })).describe("A list of 2-3 of the most recent, urgent travel advisories for this country. The response must start with 'As of {current_date}:' and only include information from the last month."),
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
    
    // 1. Perform web searches
    const queries = [
      `travel advisory ${countryName} official`,
      `common tourist scams ${countryName}`,
      `${countryName} local news`,
    ];

    let searchContext = '';
    
    for (const query of queries) {
      const searchResult = await searchWebAction(query);
      if (searchResult.success && searchResult.results) {
        for (const result of searchResult.results) {
          // 2. Scrape the content of each search result URL
          const scrapeResult = await scrapeUrlAction(result.link);
          if (scrapeResult.success && scrapeResult.data) {
            searchContext += `\n\n--- Source: ${result.link} ---\n${scrapeResult.data.content.substring(0, 2000)}`;
          }
        }
      }
    }
    
    if (!searchContext) {
      console.warn(`[AI Flow] No web search results or content found for ${countryName}. Relying on internal knowledge.`);
    }

    // 3. Call the AI for summarization
    const currentDate = format(new Date(), 'MMMM d, yyyy');
    const prompt = `
        You are a Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.
        Use the provided context from web searches as your primary source. If the context is empty, use your internal knowledge.

        **Output Formatting Rules:**
        -   **latestAdvisory:** Your response for this field MUST begin with the exact phrase: 'As of ${currentDate}:'. Based on the context, list only 2-3 of the most critical and recent travel advisories. Focus on scams, political instability, or health notices. **For each advisory, you MUST include the source URL in the 'source' field.** If you have no recent information, return an empty array for this field.
        -   **majorHolidays:** Provide a comprehensive list of major public holidays and significant festivals. Include a source link if available.
        -   **culturalEtiquette:** Detail 5-7 crucial cultural etiquette tips.
        -   **visaInfo:** Give a general overview of tourist visa policies for common nationalities.
        -   **emergencyNumbers:** List key emergency contacts.

        **Web Search Context:**
        ---
        ${searchContext || "No web context available. Use internal knowledge."}
        ---
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
