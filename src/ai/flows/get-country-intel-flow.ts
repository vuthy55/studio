
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This has been refactored to a direct search-and-summarize flow to improve reliability.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { format } from 'date-fns';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
  latestAdvisory: z.array(z.string()).describe("A list of 2-3 of the most recent, urgent travel advisories, scams, or relevant news for this country, summarized from the provided text. The response must start with 'As of {current_date}:' and only include information from the last month."),
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


// --- Helper Functions for Search and Scrape ---
async function searchWeb(query: string): Promise<string[]> {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
        throw new Error("Google Search API credentials are not configured on the server.");
    }
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await axios.get(url);
        const items = response.data.items || [];
        return items.slice(0, 4).map((item: any) => item.link); // Return top 4 URLs
    } catch (error: any) {
        console.error("[Intel Search] Error performing Google search:", error.response?.data || error.message);
        throw new Error("Failed to execute web search.");
    }
}

async function scrapeUrl(url: string): Promise<string> {
    try {
        const { data } = await axios.get(url, { timeout: 4000 });
        const $ = cheerio.load(data);
        $('script, style, nav, footer, header, aside').remove();
        const mainContent = $('body').text().replace(/\s+/g, ' ').trim();
        return mainContent.substring(0, 4000); // Limit content per page
    } catch (error: any) {
        console.warn(`[Intel Scrape] Failed to scrape ${url}:`, error.message);
        return `Scraping failed for ${url}.`; // Return error message instead of empty string
    }
}


// --- Genkit Flow Definition ---

const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName }) => {
    
    // Step 1: Perform web searches directly in the flow
    const searchQueries = [
      `travel advisory ${countryName}`,
      `latest travel news ${countryName} tourists`,
      `common tourist scams ${countryName}`,
    ];
    const searchPromises = searchQueries.map(searchWeb);
    const searchResults = await Promise.all(searchPromises);
    const uniqueUrls = [...new Set(searchResults.flat())];

    // Step 2: Scrape the content from the found URLs
    const scrapePromises = uniqueUrls.map(scrapeUrl);
    const scrapedContents = await Promise.all(scrapePromises);
    const combinedContext = scrapedContents.join('\n\n---\n\n');

    if (!combinedContext.trim()) {
        throw new Error("Could not retrieve any information from the web.");
    }

    // Step 3: Call the AI for summarization
    const currentDate = format(new Date(), 'MMMM d, yyyy');
    const prompt = `
        You are a Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.
        Base your 'latestAdvisory' section *only* on the provided text below. For all other sections (holidays, etiquette, etc.), use your general knowledge.

        **Provided Context from Web Search:**
        ---
        ${combinedContext}
        ---

        **Output Formatting Rules:**
        -   **latestAdvisory:** Your response for this field MUST begin with the exact phrase: 'As of ${currentDate}:'. From the provided context, extract and list only 2-3 of the most critical and recent (within the last month) travel advisories. Focus on scams, political instability, or health notices. If the context contains no relevant new information, return an empty array for this field.
        -   **majorHolidays:** Provide a comprehensive list of major public holidays and significant festivals.
        -   **culturalEtiquette:** Detail 5-7 crucial cultural etiquette tips.
        -   **visaInfo:** Give a general overview of tourist visa policies for common nationalities.
        -   **emergencyNumbers:** List key emergency contacts.
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
