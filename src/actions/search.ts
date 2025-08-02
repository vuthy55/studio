
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
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    // Added for debugging to verify environment variables are loaded.
    console.log(`[Search Action Debug] Using API Key: ${apiKey ? 'Loaded' : 'MISSING'}, Search Engine ID: ${searchEngineId ? 'Loaded' : 'MISSING'}`);

    if (!apiKey || !searchEngineId) {
        console.error("Google Search API credentials are not configured on the server.");
        return { success: false, error: "Google Search API key or Search Engine ID is not configured on the server." };
    }
    
    const url = `https://www.googleapis.com/customsearch/v1`;

    try {
        const response = await axios.get(url, {
            params: {
                key: apiKey,
                cx: searchEngineId,
                q: query,
                num: 5 // Limit to 5 results per category
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
