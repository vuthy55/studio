
"use server";
/**
 * @fileOverview A Genkit flow for testing the AI's ability to generate a summary.
 * This flow is simplified to rely on the model's internal knowledge, mirroring the stable
 * implementation of the main InfoHub feature.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

interface TestResult {
    summary: string;
}

// Main Exported Function
export async function testAdvancedSearch(): Promise<TestResult> {
  const result = await testSearchFlow();
  return { summary: result };
}


const testSearchFlow = ai.defineFlow(
  {
    name: 'testAdvancedSearchFlow',
    inputSchema: z.void(),
    outputSchema: z.string(),
  },
  async () => {
    
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
  }
);
