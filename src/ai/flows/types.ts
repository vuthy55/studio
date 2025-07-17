
import { z } from 'zod';
import type { Message } from 'genkit';

export const HistoryItemSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const ConverseInputSchema = z.object({
  history: z.custom<Message[]>(),
  language: z.string(),
  userMessage: z.string(),
});
export type ConverseInput = z.infer<typeof ConverseInputSchema>;

export const ConverseOutputSchema = z.object({
  reply: z.string(),
});
export type ConverseOutput = z.infer<typeof ConverseOutputSchema>;


export const TranslateTextInputSchema = z.object({
    text: z.string(),
    fromLanguage: z.string(),
    toLanguage: z.string(),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
    translatedText: z.string(),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;
