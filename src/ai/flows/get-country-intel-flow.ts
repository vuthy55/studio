
'use server';
/**
 * @fileOverview A Genkit flow to get travel intel for a given country.
 * This flow performs targeted web searches for various safety and advisory categories,
 * verifies that the source links are active, and returns a categorized list of links.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { performWebSearch, scrapeUrl } from '@/ai/tools/web-research';

// --- Zod Schemas for Input/Output ---

const GetCountryIntelInputSchema = z.object({
  countryName: z.string().describe('The name of the country to get travel intel for.'),
});
type GetCountryIntelInput = z.infer<typeof GetCountryIntelInputSchema>;

const ArticleSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string(),
});

const CountryIntelSchema = z.object({
  advisories: z.array(ArticleSchema).describe('Links to official government travel advisories.'),
  scams: z.array(ArticleSchema).describe('Links to articles about common tourist scams.'),
  theft: z.array(ArticleSchema).describe('Links to articles about theft, robbery, or kidnapping.'),
  health: z.array(ArticleSchema).describe('Links to articles about health risks or disease outbreaks.'),
  political: z.array(ArticleSchema).describe('Links to articles about the political situation, protests, or unrest.'),
});
export type CountryIntel = z.infer<typeof CountryIntelSchema>;


// --- Main Exported Function ---
export async function getCountryIntel(input: GetCountryIntelInput): Promise<Partial<CountryIntel>> {
  return getCountryIntelFlow(input);
}

// --- Helper Function ---

/**
 * Searches for a given query, scrapes the results, and returns verified articles.
 * @param query The search query string.
 * @returns A promise that resolves to an array of verified articles.
 */
async function searchAndVerify(query: string): Promise<z.infer<typeof ArticleSchema>[]> {
  const searchResults = await performWebSearch({ query });
  const verifiedArticles: z.infer<typeof ArticleSchema>[] = [];

  if (!searchResults || searchResults.length === 0) {
    return [];
  }

  // Limit to checking the top 3 results to manage processing time
  const topResults = searchResults.slice(0, 3);

  for (const result of topResults) {
    const scrapeResult = await scrapeUrl({ url: result.link });
    // Only include the article if the URL is accessible (not a 404, etc.)
    if (scrapeResult.success) {
      verifiedArticles.push(result);
    }
  }

  return verifiedArticles;
}


// --- Genkit Flow Definition ---
const getCountryIntelFlow = ai.defineFlow(
  {
    name: 'getCountryIntelFlow',
    inputSchema: GetCountryIntelInputSchema,
    outputSchema: CountryIntelSchema,
  },
  async ({ countryName }) => {
    
    // Define the categories and their search queries
    const categories = {
      advisories: `official government travel advisory ${countryName} (site:gov OR site:govt)`,
      scams: `tourist scams ${countryName} (overcharging OR fake gems OR scam centers)`,
      theft: `theft robbery kidnap tourists ${countryName}`,
      health: `health risks disease outbreak ${countryName} travel`,
      political: `political situation protest unrest ${countryName}`,
    };

    // Perform all searches in parallel
    const searchPromises = Object.values(categories).map(query => searchAndVerify(query));
    const results = await Promise.all(searchPromises);

    const output: CountryIntel = {
      advisories: results[0],
      scams: results[1],
      theft: results[2],
      health: results[3],
      political: results[4],
    };
    
    return output;
  }
);
