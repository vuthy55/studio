"use server";
/**
 * @fileOverview A temporary Genkit flow for testing the advanced web search agent.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { performWebSearch, scrapeUrl } from '@/ai/tools/web-research';

// Main Exported Function
export async function testAdvancedSearch(): Promise<string> {
  const result = await testSearchFlow();
  return result;
}


const testSearchFlow = ai.defineFlow(
  {
    name: 'testAdvancedSearchFlow',
    inputSchema: z.void(),
    outputSchema: z.string(),
  },
  async () => {
    
    // 1. Use the web search tool to find the specific page
    const searchResults = await performWebSearch({
        query: "travel advisory for Ukraine site:www.gov.uk/foreign-travel-advice"
    });

    if (!searchResults || searchResults.length === 0) {
        throw new Error("The web search tool failed to find any relevant URLs.");
    }
    
    // 2. Scrape the content of the most relevant URL
    const targetUrl = searchResults[0].link;
    const scrapedResult = await scrapeUrl({ url: targetUrl });
    
    if (!scrapedResult.success || !scrapedResult.content) {
        throw new Error(`The scrapeUrl tool failed for ${targetUrl}. Reason: ${scrapedResult.error}`);
    }

    // 3. Use an LLM to summarize the scraped content
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

    return output!;
  }
);
