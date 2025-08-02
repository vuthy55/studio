
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow orchestrates server-side actions to search and scrape the web,
 * then uses an AI model to analyze and summarize the verified content.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
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
  },
  async ({ countryName }) => {
    
    // Step 1: Search for relevant articles using a server action.
    const searchResults = await searchWebAction(`travel advisory ${countryName} scams`);
    if (!searchResults.success || !searchResults.results || searchResults.results.length === 0) {
        console.warn(`[AI Flow] Web search failed or returned no results for ${countryName}.`);
        // Fallback to AI's internal knowledge if search fails
         const { output } = await ai.generate({
            prompt: `Provide travel intelligence for ${countryName}. Focus on safety, culture, and visa info. Note that live web search failed, so use your general knowledge.`,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: CountryIntelSchema },
        });
        if (!output) throw new Error("AI failed to generate fallback intel.");
        return output;
    }
    
    // Step 2: Scrape and verify each URL.
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const verifiedSources: { url: string; content: string; }[] = [];
    
    for (const result of searchResults.results) {
        const scrapeResult = await scrapeUrlAction(result.link);
        
        // Verification check 1: Was the scrape successful?
        if (!scrapeResult.success || !scrapeResult.content) {
            console.log(`[AI Flow] Discarding source (scrape failed): ${result.link}`);
            continue;
        }
        
        // Verification check 2: Is the article recent?
        if (scrapeResult.publishedDate) {
            const published = new Date(scrapeResult.publishedDate);
            if (published < oneMonthAgo) {
                console.log(`[AI Flow] Discarding source (too old): ${result.link}`);
                continue;
            }
        }
        
        // If it passes all checks, add it to our list of good sources.
        verifiedSources.push({
            url: result.link,
            content: scrapeResult.content,
        });
    }
    
    // Step 3: Pass ONLY the verified context to the AI for summarization.
    const webContext = verifiedSources.map(source => `Source URL: ${source.url}\nContent: ${source.content}`).join('\n\n---\n\n');

    const prompt = `
        You are a diligent Travel Intelligence Analyst. Your task is to provide a critical, up-to-date travel briefing for ${countryName}.

        You have been provided with the following content, which has been scraped from verified, recent web articles. Your response for the 'latestAdvisory' field MUST be based ONLY on this provided content.
        
        -   For each advisory, you MUST cite the specific source URL where you found the information.
        -   If the provided content is empty or contains no relevant advisories, return an empty array for the 'latestAdvisory' field.
        -   For all other fields (Holidays, Etiquette, Visa, Emergency Numbers), use your own internal knowledge.

        Verified Web Content:
        ---
        ${webContext || 'No recent, verifiable web content was found.'}
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
           throw new Error("The AI model returned an empty output. This may be due to a content safety filter.");
        }
        return output;

    } catch (error: any) {
        console.error(`[AI Flow] CRITICAL: Model failed to generate intel for ${countryName}. Full error:`, error);
        throw new Error(`The AI agent could not generate travel information for ${countryName}. Reason: ${error.message}`);
    }
  }
);
