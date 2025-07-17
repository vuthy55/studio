/**
 * @fileOverview Zod schemas and TypeScript types for the translation flow.
 * This file contains the input and output definitions for translating text.
 */

import {z} from 'zod';

export const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  fromLanguage: z.string().describe('The source language of the text.'),
  toLanguage: z.string().describe('The target language for the translation.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The resulting translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;
