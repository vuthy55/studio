
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import axios from 'axios';

export const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    link: z.string().describe("The URL of the search result."),
    snippet: z.string().describe("A short summary of the page content."),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const searchWebTool = ai.defineTool(
    {
        name: 'searchWeb',
        description: 'Performs a web search using the Google Custom Search API and returns a list of results.',
        inputSchema: z.object({
            query: z.string().describe('The search query string. Should be targeted and specific.'),
        }),
        outputSchema: z.array(SearchResultSchema).describe('A list of search results.'),
    },
    async (input) => {
        const apiKey = process.env.GOOGLE_API_KEY;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        
        if (!apiKey || !searchEngineId) {
            console.error("Google Search API key or Search Engine ID is not configured on the server.");
            // Instead of throwing, return an empty array to make the agent more resilient.
            return [];
        }
        
        const url = `https://www.googleapis.com/customsearch/v1`;
        
        const params = {
            key: apiKey,
            cx: searchEngineId,
            q: input.query,
            num: 5 // Limit to 5 results to keep the context for the AI manageable.
        };

        try {
            const response = await axios.get(url, { params });

            if (response.data && response.data.items) {
                return response.data.items.map((item: any) => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                }));
            } else {
                return [];
            }
        } catch (error: any) {
            console.error(`[Search Tool] Error for query "${input.query}":`, error.response?.data?.error || error.message);
            // Return empty array on failure to allow the AI agent to continue if possible.
            return [];
        }
    }
);
