
'use server';

import axios from 'axios';

interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

interface SearchWebActionPayload {
    query: string;
    apiKey: string;
    searchEngineId: string;
    dateRestrict?: string; // e.g., 'd[30]' for last 30 days
}

/**
 * Performs a web search using the Google Custom Search API.
 * This is a server-side action to protect the API key.
 * @param {SearchWebActionPayload} payload - The search payload containing query and credentials.
 * @returns {Promise<{success: boolean, results?: SearchResult[], error?: string}>} An object with search results or an error.
 */
export async function searchWebAction(payload: SearchWebActionPayload): Promise<{success: boolean, results?: SearchResult[], error?: string}> {
    const { query, apiKey, searchEngineId, dateRestrict } = payload;
    
    if (!apiKey || !searchEngineId) {
        const errorMsg = "Google Search API key or Search Engine ID was not provided to the server action.";
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
    
    const url = `https://www.googleapis.com/customsearch/v1`;
    
    const params: Record<string, any> = {
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: 5 // Limit to 5 results per category
    };

    if (dateRestrict) {
        params.sort = `date:r:${dateRestrict}`;
    }

    try {
        const response = await axios.get(url, { params });

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
        const errorMessage = error.response?.data?.error?.message || "Failed to perform web search.";
        return { success: false, error: errorMessage };
    }
}
