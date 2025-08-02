
'use server';

import axios from 'axios';

interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

/**
 * Performs a web search using the Google Custom Search API.
 * This is a server-side action to protect the API key.
 * @param {string} query - The search query.
 * @returns {Promise<{success: boolean, results?: SearchResult[], error?: string}>} An object with search results or an error.
 */
export async function searchWebAction(query: string): Promise<{success: boolean, results?: SearchResult[], error?: string}> {
    const apiKey = process.env.GEMINI_API_KEY; // Use the existing Gemini key
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        return { success: false, error: "Google Search API credentials are not configured on the server." };
    }
    
    const url = `https://www.googleapis.com/customsearch/v1`;

    try {
        const response = await axios.get(url, {
            params: {
                key: apiKey,
                cx: searchEngineId,
                q: query,
                num: 5 // Limit to 5 results
            }
        });

        if (response.data && response.data.items) {
            const results: SearchResult[] = response.data.items.map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            }));
            return { success: true, results };
        } else {
            return { success: true, results: [] };
        }

    } catch (error: any) {
        console.error("[Search] Error performing web search:", error.response?.data?.error || error.message);
        return { success: false, error: "Failed to perform web search." };
    }
}
