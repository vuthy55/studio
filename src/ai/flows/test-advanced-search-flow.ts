
"use server";
/**
 * @fileOverview A Genkit flow for testing the AI's ability to generate a summary.
 * This flow is simplified to rely on the model's internal knowledge, mirroring the stable
 * implementation of the main InfoHub feature. It now includes robust error handling.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

interface TestResult {
    summary?: string;
    error?: string;
}

// Main Exported Function
export async function testAdvancedSearch(): Promise<TestResult> {
  try {
    const result = await testSearchFlow();
    return { summary: result };
  } catch (e: any) {
    console.error("[Test Flow] Execution failed:", e);
    // Return the error message to be displayed on the client
    return { error: e.stack || e.message || "An unknown error occurred in the flow." };
  }
}


const testSearchFlow = ai.defineFlow(
  {
    name: 'testAdvancedSearchFlow',
    inputSchema: z.void(),
    outputSchema: z.string(),
  },
  async () => {
    
    // Using try...catch to get detailed error information from the AI call
    try {
        const { output } = await ai.generate({
          prompt: `
            You are a travel intelligence analyst. 
            Based on your internal knowledge, provide a concise, one-paragraph summary of the general UK government's travel advisory for Ukraine.
          `,
          model: 'googleai/gemini-1.5-flash'
        });
        
        if (!output) {
          throw new Error("The AI model returned a null or empty response.");
        }
        return output;

    } catch (error: any) {
        console.error('[AI Generate Error]', error);
        // Re-throwing the error so it can be caught by the calling function and displayed.
        throw error;
    }
  }
);
