'use server';
/**
 * @fileOverview A Genkit flow for translating text from one language to another.
 * This file defines the AI prompt and the server-side flow for translation.
 */
import {ai} from '@/ai/genkit';
import {
  TranslateTextInput,
  TranslateTextInputSchema,
  TranslateTextOutput,
  TranslateTextOutputSchema,
} from '@/ai/schemas/translation-schema';

// This is the primary function that will be called from the server-side services.
export async function translateText(input: TranslateTextInput): Promise<TranslateTextOutput> {
  console.log('translateText flow received input:', input);
  try {
    const result = await translateTextFlow(input);
    if (!result.translatedText) {
      throw new Error('AI returned empty translation.');
    }
    console.log('translateText flow produced output:', result);
    return result;
  } catch (error) {
    console.error('Error within translateText flow:', error);
    throw new Error('Failed to translate text.');
  }
}

const translationPrompt = ai.definePrompt({
  name: 'translationPrompt',
  model: 'gemini-pro',
  input: {schema: TranslateTextInputSchema},
  output: {schema: TranslateTextOutputSchema},
  prompt: `Translate the following text from {{fromLanguage}} to {{toLanguage}}. Only provide the translated text as the output.

Text to translate:
"{{text}}"`,
});

const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async (input: TranslateTextInput) => {
    const {output} = await translationPrompt(input);
    return output!;
  },
);
