
'use server';
import axios from 'axios';

interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

export async function searchWebAction(query: string): Promise<{ success: boolean, results?: SearchResult[], error?: string }> {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        const errorMsg = "Google Search API credentials are not configured on the server.";
        console.error(`[Search Action] ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(url);
        const results: SearchResult[] = response.data.items?.map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
        })) || [];
        
        return { success: true, results: results.slice(0, 5) }; // Return top 5 results

    } catch (error: any) {
        console.error('[Search Action] Error fetching search results:', error);
        return { success: false, error: 'Failed to fetch search results.' };
    }
}
