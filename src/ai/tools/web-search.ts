
'use server';
/**
 * @fileOverview A set of Genkit Tools for performing web searches and scraping content.
 * These tools empower an AI agent to conduct its own research.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import axios from 'axios';
import * as cheerio from 'cheerio';


// --- Web Search Tool ---

const WebSearchInputSchema = z.object({
    query: z.string().describe("The search query to find information on the web."),
});

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    link: z.string().describe("The URL of the search result."),
    snippet: z.string().describe("A brief snippet of content from the result."),
});

const WebSearchOutputSchema = z.array(SearchResultSchema).describe("A list of search results.");

export const webSearch = ai.defineTool(
    {
        name: 'webSearch',
        description: 'Performs a web search to find information on a given topic. Returns a list of relevant URLs and snippets.',
        inputSchema: WebSearchInputSchema,
        outputSchema: WebSearchOutputSchema,
    },
    async ({ query }) => {
        const apiKey = process.env.GOOGLE_API_KEY;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        
        if (!apiKey || !searchEngineId) {
            console.error("[AI Tool Error] Missing GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID in environment variables.");
            throw new Error("Google Search API credentials are not configured on the server. Please set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID.");
        }
        
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
        
        try {
            const response = await axios.get(url);
            const items = response.data.items || [];
            return items.slice(0, 5).map((item: any) => ({ // Return top 5 results
                title: item.title,
                link: item.link,
                snippet: item.snippet,
            }));
        } catch (error: any) {
            console.error("Error performing Google search:", error.response?.data || error.message);
            throw new Error("Failed to execute web search.");
        }
    }
);


// --- Web Scraper Tool ---

const ScrapeWebInputSchema = z.object({
    url: z.string().describe("The URL of the webpage to scrape for its main textual content."),
});

const ScrapeWebOutputSchema = z.string().describe("The extracted text content from the webpage.");

export const scrapeWeb = ai.defineTool(
    {
        name: 'scrapeWeb',
        description: 'Fetches the content of a given URL and extracts the main text, stripping HTML and other clutter.',
        inputSchema: ScrapeWebInputSchema,
        outputSchema: ScrapeWebOutputSchema,
    },
    async ({ url }) => {
        try {
            const { data } = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                }
            });

            const $ = cheerio.load(data);
            
            // A more robust scraping strategy
            $('script, style, nav, footer, header, aside').remove();
            let mainContent = $('main, article, .main-content, .post-content, #content, #main').first().text();

            if (!mainContent) {
                mainContent = $('body').text();
            }

            // Clean up the text: remove extra whitespace, newlines, etc.
            const cleanedText = mainContent.replace(/\s+/g, ' ').trim();
            
            // Return a substring to avoid massive context windows for the AI
            return cleanedText.substring(0, 15000);

        } catch (error: any) {
            console.error(`[scrapeWeb] Failed to fetch or parse URL ${url}:`, error.message);
            // Instead of throwing an error, return an empty string to allow the agent to continue
            return ""; 
        }
    }
);
