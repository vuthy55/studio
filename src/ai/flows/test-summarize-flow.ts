
'use server';
/**
 * @fileOverview A temporary Genkit flow for testing content summarization.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

const summarizeContentFlow = ai.defineFlow(
  {
    name: 'summarizeContentFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (content) => {
    // This prompt mirrors the robust prompt style used in the working InfoHub feature.
    const { output } = await ai.generate({
      prompt: `You are a travel intelligence analyst. Based ONLY on the following text content from a government travel advisory page, provide a concise, one-paragraph summary of the key warnings and advice for travelers.
        
        ---
        CONTENT:
        ${content}
        ---
      `,
      model: 'googleai/gemini-1.5-flash',
    });
    
    if (!output) {
      throw new Error("The AI model returned a null or empty response.");
    }
    return output;
  }
);

export async function summarizeContent(content: string): Promise<string> {
    return summarizeContentFlow(content);
}
