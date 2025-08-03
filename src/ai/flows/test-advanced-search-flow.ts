
"use server";
/**
 * @fileOverview A temporary Genkit flow for testing the advanced web search agent.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { performWebSearch, scrapeUrl } from '@/ai/tools/web-research';

interface TestResult {
    summary: string;
    debugLog: string[];
}

// Main Exported Function
export async function testAdvancedSearch(): Promise<TestResult> {
  const debugLog: string[] = ["[Test Flow] Process started."];
  try {
    const result = await testSearchFlow(debugLog);
    debugLog.push("[Test Flow] Process finished successfully.");
    return { summary: result, debugLog };
  } catch (error: any) {
    debugLog.push(`[Test Flow] CRITICAL CLIENT-SIDE ERROR: ${error.message}`);
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
        const errorMsg = 'CRITICAL: GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing from server environment.';
        debugLog.push(`[Test Flow] ${errorMsg}`);
        throw new Error(errorMsg);
    }
    debugLog.push('[Test Flow] API keys found.');

    debugLog.push(`[Test Flow] Calling AI to find and summarize the content...`);
    const { output } = await ai.generate({
      prompt: `
        You are a travel intelligence analyst. Your task is to provide a concise, one-paragraph summary of the UK government's travel advisory for Ukraine.
        
        To do this, you MUST follow these steps:
        1. First, use the performWebSearch tool to find the UK government's travel advisory for Ukraine. Your query should be highly specific, like "travel advisory for Ukraine site:www.gov.uk/foreign-travel-advice".
        2. From the search results, take the most relevant URL and use the scrapeUrl tool to get its content.
        3. Finally, based ONLY on the successfully scraped article content, write your summary.
      `,
      model: 'googleai/gemini-1.5-flash',
      tools: [performWebSearch, scrapeUrl]
    });
    
    debugLog.push(`[Test Flow] AI processing complete.`);
    if (!output) {
      throw new Error("The AI model returned a null or empty response. This may be due to a tool failure or an issue with the model's output generation.");
    }
    return output;
  }
);
