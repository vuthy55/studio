'use server';
/**
 * @fileOverview This file defines the Zod schemas and TypeScript types
 * for the translation flow's inputs and outputs. Separating schemas
 * ensures they can be imported into client components without bundling
 * server-side code.
 */

import {z} from 'zod';

export const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  fromLanguage: z
    .string()
    .describe('The language of the original text (e.g., "English").'),
  toLanguage: z
    .string()
    .describe('The language to translate the text into (e.g., "Thai").'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The resulting translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;
