
"use server";
/**
 * @fileOverview A temporary Genkit flow for testing the advanced web search agent.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { performWebSearch, scrapeUrl } from '@/ai/tools/web-research';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';

interface TestResult {
    summary: string;
    debugLog: string[];
}

// Main Exported Function
export async function testAdvancedSearch(): Promise<TestResult> {
  const debugLog: string[] = [];
  try {
    const result = await testSearchFlow(debugLog);
    debugLog.push("[Test Flow] Process finished successfully.");
    return { summary: result, debugLog };
  } catch (error: any) {
    debugLog.push(`[Test Flow] CRITICAL ERROR: ${error.message}`);
    // Re-throw the error but attach the debug log to it
    const enhancedError = new Error(error.message);
    (enhancedError as any).debugLog = debugLog;
    throw enhancedError;
  }
}


const testSearchFlow = ai.defineFlow(
  {
    name: 'testAdvancedSearchFlow',
    inputSchema: z.custom<string[]>(),
    outputSchema: z.string(),
  },
  async (debugLog) => {
    
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[Test Flow] CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.');
        throw new Error('Google Search API credentials are not configured on the server.');
    }
    debugLog.push('[Test Flow] API keys found.');

    const query = "travel advisory for Ukraine site:www.gov.uk/foreign-travel-advice";
    debugLog.push(`[Test Flow] Performing web search with query: "${query}"`);

    const searchResult = await searchWebAction({ query, apiKey, searchEngineId });

    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        debugLog.push(`[Test Flow] Web search failed or returned no results. Error: ${searchResult.error || 'No results returned'}`);
        throw new Error("The web search tool failed to find any relevant URLs.");
    }
    
    debugLog.push(`[Test Flow] Web search successful. Found ${searchResult.results.length} URLs.`);
    
    const targetUrl = searchResult.results[0].link;
    debugLog.push(`[Test Flow] Attempting to scrape the first URL: ${targetUrl}`);
    
    const scrapedResult = await scrapeUrlAction(targetUrl);
    
    if (!scrapedResult.success || !scrapedResult.content) {
        debugLog.push(`[Test Flow] Scraping failed. Reason: ${scrapedResult.error}`);
        throw new Error(`The scrapeUrl tool failed for ${targetUrl}. Reason: ${scrapedResult.error}`);
    }
    debugLog.push(`[Test Flow] Scraping successful. Content length: ${scrapedResult.content.length}`);

    debugLog.push(`[Test Flow] Calling AI to summarize the content...`);
    const { output } = await ai.generate({
      prompt: `
        You are a travel intelligence analyst. Based ONLY on the following article content from the UK government, provide a concise summary of the travel advisory for Ukraine.
        
        Article Content:
        ---
        ${scrapedResult.content}
        ---
      `,
      model: 'googleai/gemini-1.5-flash',
    });
    
    debugLog.push(`[Test Flow] AI summary generated.`);
    return output!;
  }
);

    