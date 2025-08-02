
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';


export const performWebSearch = ai.defineTool(
    {
        name: 'performWebSearch',
        description: 'Performs a web search to find recent articles about a given topic. Use this to find travel advisories, news, or cultural information.',
        input: z.object({
            query: z.string().describe('A concise search query, like "travel advisory Thailand" or "visa requirements for Vietnam for US citizens".')
        }),
        output: z.array(z.object({
            title: z.string(),
            link: z.string(),
            snippet: z.string()
        })),
    },
    async (input) => {
        const searchResult = await searchWebAction(input.query);
        if (!searchResult.success) {
            throw new Error(searchResult.error || 'Web search failed.');
        }
        return searchResult.results || [];
    }
);


export const scrapeUrl = ai.defineTool(
    {
        name: 'scrapeUrl',
        description: 'Fetches the textual content of a given webpage URL. Use this to read the content of the search results.',
        input: z.object({
            url: z.string().describe('The full URL of the webpage to scrape.')
        }),
        output: z.string().describe('The text content of the webpage, or an error message if scraping failed.'),
    },
    async (input) => {
        const scrapeResult = await scrapeUrlAction(input.url);
        if (!scrapeResult.success) {
            // Return a descriptive error string to the AI so it knows why it failed.
            return `Scraping failed: ${scrapeResult.error}`;
        }
        return scrapeResult.content || 'No content found.';
    }
);
