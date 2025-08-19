

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import axios from 'axios';

export const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    link: z.string().describe("The URL of the search result."),
    snippet: z.string().describe("A short summary of the page content."),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Performs a web search using the Google Custom Search API and returns a list of results.
 * This is a regular server-side function, NOT a server action, to be used by other server logic.
 * @param input - An object containing the search query.
 * @returns {Promise<{success: boolean, results?: SearchResult[], error?: string}>}
 */
export async function searchWebAction(input: { query: string }): Promise<{success: boolean, results?: SearchResult[], error?: string}> {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        const errorMsg = "Google Search API key or Search Engine ID is not configured on the server.";
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
    
    const url = `https://www.googleapis.com/customsearch/v1`;
    
    const params = {
        key: apiKey,
        cx: searchEngineId,
        q: input.query,
        num: 10 // Fetch 10 results to give the AI more context
    };

    try {
        const response = await axios.get(url, { params });

        if (response.data && response.data.items) {
            const results = response.data.items.map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            }));
            return { success: true, results };
        } else {
            return { success: true, results: [] };
        }
    } catch (error: any) {
        console.error(`[Search Function] Error for query "${input.query}":`, error.response?.data?.error || error.message);
        return { success: false, error: `Search failed: ${error.response?.data?.error?.message || error.message}`};
    }
}
