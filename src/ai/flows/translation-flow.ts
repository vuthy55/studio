
'use server';
/**
 * @fileOverview A Genkit flow for translating text from one language to another.
 *
 * - translateText - A function that handles the text translation.
 */

import {ai} from '@/ai/genkit';
import {googleAI} from '@genkit-ai/googleai';
import {
  TranslateTextInput,
  TranslateTextInputSchema,
  TranslateTextOutput,
  TranslateTextOutputSchema,
} from '@/ai/schemas/translation-schema';

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  console.log('Translation input:', input);
  try {
    const result = await translateTextFlow(input);
    console.log('Translation output:', result);
    return result;
  } catch (error) {
    console.error('Error in translateText flow:', error);
    throw new Error('Failed to translate text.');
  }
}

const translationPrompt = ai.definePrompt({
  name: 'translationPrompt',
  input: {schema: TranslateTextInputSchema},
  output: {schema: TranslateTextOutputSchema},
  prompt: `You are a direct translation assistant. Your only task is to translate the user's text from {{{fromLanguage}}} to {{{toLanguage}}}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation.

Text to translate: "{{{text}}}"`,
  config: {
    temperature: 0.1,
    model: googleAI('gemini-pro'), // Let Genkit handle the model and API key
  },
});

const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async (input: TranslateTextInput) => {
    const {output} = await translationPrompt(input);

    if (!output) {
      throw new Error('Translation prompt returned no output.');
    }
    return output;
  }
);
