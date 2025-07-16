
'use server';
/**
 * @fileOverview A service for translating text from one language to another.
 *
 * - translateText - A function that handles the text translation.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translateText function.
 */

import { generate } from 'genkit/ai';
import { geminiPro } from '@genkit/googleai';
import { z } from 'zod';

const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  fromLanguage: z.string().describe('The source language of the text.'),
  toLanguage: z.string().describe('The target language for the translation.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${input.fromLanguage} to ${input.toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation.

Text to translate:
"${input.text}"
`;

  const llmResponse = await generate({
    model: geminiPro,
    prompt: prompt,
    output: {
      schema: TranslateTextOutputSchema,
    },
  });

  return llmResponse.output() as TranslateTextOutput;
}
