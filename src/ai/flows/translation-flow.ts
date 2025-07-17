'use server';
/**
 * @fileOverview A Genkit flow for translating text from one language to another.
 *
 * - translateText - A function that handles the text translation.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translateText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit/zod';

export const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  fromLanguage: z
    .string()
    .describe('The source language of the text (e.g., "English").'),
  toLanguage: z
    .string()
    .describe('The target language for the translation (e.g., "Thai").'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
  translatedText: z
    .string()
    .describe('The translated text in the target language.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;

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
