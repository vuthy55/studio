
'use server';

import { ai } from '@/ai/genkit';
import { TranslateTextInputSchema, TranslateTextOutputSchema, type TranslateTextInput, type TranslateTextOutput } from './types';


const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async ({ text, fromLanguage, toLanguage }) => {
    const {output} = await ai.generate({
        prompt: `Translate the following text from ${fromLanguage} to ${toLanguage}: ${text}`,
        model: 'googleai/gemini-1.5-flash-preview',
        output: {
            schema: TranslateTextOutputSchema,
        },
    });
    return output!;
  }
);


export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  return translateTextFlow(input);
}
