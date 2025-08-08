
'use server';
/**
 * @fileOverview A Genkit flow to detect the language of a given text.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

const DetectLanguageInputSchema = z.object({
  text: z.string().describe('The text content to analyze.'),
});
type DetectLanguageInput = z.infer<typeof DetectLanguageInputSchema>;

const DetectLanguageOutputSchema = z.object({
    language: z.string().describe("The detected language name in English (e.g., 'Thai', 'Vietnamese', 'English')."),
});
type DetectLanguageOutput = z.infer<typeof DetectLanguageOutputSchema>;


const detectLanguageFlow = ai.defineFlow(
  {
    name: 'detectLanguageFlow',
    inputSchema: DetectLanguageInputSchema,
    outputSchema: DetectLanguageOutputSchema,
  },
  async ({ text }) => {
    
    const { output } = await ai.generate({
      prompt: `What language is the following text written in? Respond with only the English name of the language (e.g., "Thai", "Spanish", "English").\n\nText: "${text}"`,
      model: 'googleai/gemini-1.5-flash',
      output: {
        schema: DetectLanguageOutputSchema,
      },
    });

    return output!;
  }
);

export async function detectLanguage(input: DetectLanguageInput): Promise<DetectLanguageOutput> {
  return detectLanguageFlow(input);
}
