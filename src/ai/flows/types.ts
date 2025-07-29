import { z } from 'zod';

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
