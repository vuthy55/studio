
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';


export const performWebSearch = ai.defineTool(
    {
        name: 'performWebSearch',
        description: 'Performs a web search to find recent articles about a given topic. Use this to find travel advisories, news, or cultural information.',
        inputSchema: z.object({
            query: z.string().describe('A concise search query, like "travel advisory Thailand" or "visa requirements for Vietnam for US citizens".')
        }),
        outputSchema: z.array(z.object({
            title: z.string(),
            link: z.string(),
            snippet: z.string()
        })),
    },
    async (input) => {
        const apiKey = process.env.GOOGLE_API_KEY;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

        if (!apiKey || !searchEngineId) {
            throw new Error('Google Search API credentials are not configured on the server.');
        }

        const searchResult = await searchWebAction({ 
            query: input.query,
            apiKey,
            searchEngineId 
        });

        if (!searchResult.success) {
            // Throw a clear error instead of returning an empty array.
            throw new Error(`Web search failed: ${searchResult.error || 'Unknown error'}`);
        }
        
        if (!searchResult.results || searchResult.results.length === 0) {
            throw new Error('The web search tool failed to find any relevant URLs.');
        }

        return searchResult.results;
    }
);


export const scrapeUrl = ai.defineTool(
    {
        name: 'scrapeUrl',
        description: 'Fetches the textual content and publication date of a given webpage URL. Use this to read the content of the search results.',
        inputSchema: z.object({
            url: z.string().describe('The full URL of the webpage to scrape.')
        }),
        outputSchema: z.object({
            success: z.boolean().describe("Indicates if the scrape was successful."),
            content: z.string().optional().describe("The text content of the webpage, if successful."),
            publishedDate: z.string().optional().describe("The estimated publication date in YYYY-MM-DD format, if found."),
            error: z.string().optional().describe("An error message if the scrape failed."),
        }),
    },
    async (input) => {
        return scrapeUrlAction(input.url);
    }
);
