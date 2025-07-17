/**
 * @fileOverview Defines the Zod schemas and TypeScript types for the translation flow.
 * This keeps data structures separate from the server-side logic.
 */

import {z} from 'zod';

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
