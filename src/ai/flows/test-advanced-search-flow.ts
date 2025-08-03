
"use server";
/**
 * @fileOverview A Genkit flow for testing a multi-step AI agent.
 * This flow now mirrors the robust, sequential logic of the main InfoHub feature.
 * 1. It performs a targeted web search against a specific government site.
 * 2. It scrapes the content from the top search result.
 * 3. It passes the verified content to the AI for summarization.
 * This provides a reliable, end-to-end test of the agent's research capabilities.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';

interface TestResult {
    summary?: string;
    error?: string;
    debugLog: string[];
}

// Main Exported Function
export async function testAdvancedSearch(): Promise<TestResult> {
    const debugLog: string[] = [];
    try {
        const result = await testSearchFlow({ debugLog });
        return { summary: result, debugLog };
    } catch (e: any) {
        console.error("[Test Flow] Top-level execution failed:", e);
        debugLog.push(`[CRITICAL] Flow failed: ${e.stack || e.message}`);
        return { error: e.stack || e.message || "An unknown error occurred in the flow.", debugLog };
    }
}


const generateWithFallback = async (prompt: string, context: any, debugLog: string[]) => {
    try {
        debugLog.push('[INFO] Attempting summarization with gemini-1.5-flash...');
        const { output } = await ai.generate({
          prompt,
          model: 'googleai/gemini-1.5-flash',
          context
        });
        
        if (!output) {
            debugLog.push("[WARN] gemini-1.5-flash returned null. Trying fallback with gemini-1.5-pro...");
             const { output: fallbackOutput } = await ai.generate({
              prompt,
              model: 'googleai/gemini-1.5-pro',
              context
            });
             if (!fallbackOutput) {
                 debugLog.push("[FAIL] The fallback AI model (gemini-1.5-pro) also returned a null or empty response.");
                 throw new Error("The AI model returned a null or empty response.");
            }
            debugLog.push("[SUCCESS] Fallback model succeeded.");
            return fallbackOutput;
        }
        
        debugLog.push("[SUCCESS] Primary model succeeded.");
        return output;

    } catch (error: any) {
        debugLog.push(`[FAIL] AI summarization failed: ${error.stack || error.message}`);
        throw error;
    }
};


const testSearchFlow = ai.defineFlow(
  {
    name: 'testAdvancedSearchFlow',
    inputSchema: z.object({ debugLog: z.custom<string[]>() }),
    outputSchema: z.string(),
  },
  async ({ debugLog }) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        debugLog.push('[FAIL] Google Search API credentials are not configured on the server.');
        throw new Error('Google Search API credentials are not configured on the server.');
    }

    // 1. Search
    const searchQuery = 'official government travel advisory Ukraine site:www.gov.uk/foreign-travel-advice';
    debugLog.push(`[INFO] Performing search with query: "${searchQuery}"`);
    const searchResult = await searchWebAction({ query: searchQuery, apiKey, searchEngineId });
    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        debugLog.push(`[FAIL] Web search failed. Reason: ${searchResult.error || 'No results found.'}`);
        throw new Error(`Web search failed: ${searchResult.error || 'No results found.'}`);
    }
    const topUrl = searchResult.results[0].link;
    debugLog.push(`[SUCCESS] Found top URL: ${topUrl}`);

    // 2. Scrape
    debugLog.push(`[INFO] Scraping URL: ${topUrl}`);
    const scrapeResult = await scrapeUrlAction(topUrl);
    if (!scrapeResult.success || !scrapeResult.content) {
        debugLog.push(`[FAIL] Scraping failed. Reason: ${scrapeResult.error || 'No content found.'}`);
        throw new Error(`Scraping failed: ${scrapeResult.error || 'No content found.'}`);
    }
    debugLog.push(`[SUCCESS] Scraped ${scrapeResult.content.length} characters.`);

    // 3. Summarize
    debugLog.push('[INFO] Sending content to AI for summarization...');
    
    const prompt = `
        You are a travel intelligence analyst. Your task is to analyze the provided article.
        
        --- CATEGORY: Official Advisory ---
        Source URL: {{{url}}}
        Article Content:
        {{{content}}}
        
        --- INSTRUCTIONS ---
        Based ONLY on the information provided above, provide a concise, one-paragraph summary of the travel advisory.
    `;

    const context = {
        url: topUrl,
        content: scrapeResult.content
    };
    
    return await generateWithFallback(prompt, context, debugLog);
  }
);
