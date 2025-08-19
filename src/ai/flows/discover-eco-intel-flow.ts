
'use server';
/**
 * @fileOverview An advanced, multi-step Genkit flow to discover and structure eco-intelligence data for a given country.
 *
 * This flow acts as a true research agent. It uses tools to perform live web searches,
 * scrapes the content of the most relevant results, and then analyzes the verified
 * information to produce a high-quality, structured output.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { DiscoverEcoIntelInputSchema, DiscoverEcoIntelOutputSchema, type DiscoverEcoIntelInput, type DiscoverEcoIntelOutput } from './types';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';

// --- Genkit Tools Definition ---

const search_web = ai.defineTool(
  {
    name: 'search_web',
    description: 'Performs a targeted Google search and returns a list of URLs and snippets.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.array(z.object({ title: z.string(), link: z.string(), snippet: z.string() })),
  },
  async (input) => {
    const searchResult = await searchWebAction({ query: input.query });
    if (searchResult.success && searchResult.results) {
      return searchResult.results;
    }
    return [];
  }
);

const scrape_url = ai.defineTool(
  {
    name: 'scrape_url',
    description: 'Scrapes the full text content of a given URL. Use this to get more detail after an initial web search.',
    inputSchema: z.object({ url: z.string().url() }),
    outputSchema: z.string(),
  },
  async (input) => {
    const scrapeResult = await scrapeUrlAction(input.url);
    return scrapeResult.content || `Scraping failed: ${scrapeResult.error}`;
  }
);

// --- Main Exported Function ---

export async function discoverEcoIntel(input: DiscoverEcoIntelInput): Promise<{ ecoData: DiscoverEcoIntelOutput | null; agentLog: string[] }> {
  const agentLog: string[] = [];
  const log = (message: string) => agentLog.push(message);
  
  log(`[AGENT] Starting research for ${input.countryName}.`);
  try {
    const ecoData = await discoverEcoIntelFlow({ countryName: input.countryName, log });
    return { ecoData, agentLog };
  } catch (error: any) {
    log(`[AGENT_FAIL] Flow failed for ${input.countryName}: ${error.message}`);
    // Return null on failure so the caller can handle it gracefully.
    return { ecoData: null, agentLog };
  }
}

// --- Genkit Flow and Prompt Definitions ---

const discoverEcoIntelFlow = ai.defineFlow(
  {
    name: 'discoverEcoIntelFlow',
    inputSchema: DiscoverEcoIntelInputSchema.extend({ log: z.custom<(message: string) => void>() }),
    outputSchema: DiscoverEcoIntelOutputSchema,
  },
  async ({ countryName, log }) => {
    
    log('[AGENT] Generating search queries.');
    const queries = [
        `(ministry OR department OR agency) of (environment OR forestry OR climate change) official site in ${countryName}`,
        `top environmental NGOs for (tree planting OR conservation OR recycling) in ${countryName}`,
        `carbon offsetting programs in ${countryName}`,
        `eco-tourism opportunities in ${countryName}`
    ];

    log(`[AGENT] Executing ${queries.length} search queries.`);
    const { output } = await ai.generate({
      prompt: `
        You are an expert environmental and geopolitical research analyst.
        Your task is to use the provided tools to build a detailed profile of the key environmental organizations and eco-tourism opportunities in **${countryName}**.

        **Execution Plan:**
        1.  **Iterate Through Queries:** For each of the following queries, execute the \`search_web\` tool to get a list of relevant websites.
            - \`search_web: ${queries[0]}\`
            - \`search_web: ${queries[1]}\`
            - \`search_web: ${queries[2]}\`
            - \`search_web: ${queries[3]}\`
        2.  **Scrape Top Results:** From the search results of *each* query, identify the top 2-3 most promising and official-looking URLs. Execute the \`scrape_url\` tool for each of these URLs to get their full content.
        3.  **Analyze and Synthesize:** Carefully read through all the scraped content you have gathered. From this text, extract and compile the information required to fully populate the output JSON object.
        4.  **Format and Return:** Ensure your final output strictly adheres to the JSON schema. If you cannot find any verifiable entries for a category (e.g., no NGOs found), return an empty array for that category.

        **CRITICAL Data Requirements:**
        - **URLs are Mandatory for Organizations**: For every government body, NGO, or offsetting opportunity, you MUST find and include its full, direct, official URL. If you cannot find a URL in the scraped text, DISCARD that organization. Do not include entries with empty or placeholder URLs.
        - **Activity Type is Mandatory for Offsetting**: For every entry in \`offsettingOpportunities\`, you MUST include an \`activityType\` string. Infer the most likely type from the organization's name or description (e.g., 'tree_planting', 'renewable_energy', 'conservation', 'community_development').
        - **Booking URLs are Optional for Eco-Tourism**: For eco-tourism opportunities, a booking URL is helpful but not required. **If a booking URL is not found in the text, you MUST OMIT the \`bookingUrl\` field entirely for that entry. Do NOT discard the opportunity.**
      `,
      model: 'googleai/gemini-1.5-pro',
      tools: [search_web, scrape_url],
      output: {
        schema: DiscoverEcoIntelOutputSchema,
      },
    });

    if (!output) {
      throw new Error("AI analysis failed to generate a valid response (returned null). This may be due to a lack of relevant search results or a content safety block.");
    }
    
    if (output.ecoTourismOpportunities) {
        output.ecoTourismOpportunities.forEach(opp => {
          if ('bookingUrl' in opp && (opp.bookingUrl === "" || opp.bookingUrl === null)) {
            delete (opp as Partial<typeof opp>).bookingUrl;
          }
        });
    }

    log('[AGENT] AI analysis and data extraction complete.');
    return output;
  }
);
