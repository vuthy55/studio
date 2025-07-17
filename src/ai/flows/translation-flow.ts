'use server';
/**
 * @fileOverview A Genkit flow for translating text between languages using the Gemini API.
 */

import {ai} from '@/ai/genkit';
import {
  TranslateTextInputSchema,
  TranslateTextOutputSchema,
  type TranslateTextInput,
  type TranslateTextOutput,
} from '@/ai/schemas/translation-schema';

// Define the prompt for the AI model.
const translationPrompt = ai.definePrompt({
  name: 'translationPrompt',
  input: {schema: TranslateTextInputSchema},
  output: {schema: TranslateTextOutputSchema},
  model: 'gemini-pro',
  prompt: `Translate the following text from {{{fromLanguage}}} to {{{toLanguage}}}. Only provide the translated text as the output.

Text to translate:
"{{{text}}}"`,
});

// Define the Genkit flow.
const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async (input: TranslateTextInput): Promise<TranslateTextOutput> => {
    console.log('Running translation flow with input:', input);
    try {
      const {output} = await translationPrompt(input);
      if (!output) {
        throw new Error('Translation prompt returned no output.');
      }
      console.log('Translation flow successful with output:', output);
      return output;
    } catch (error) {
      console.error('Error during translation flow execution:', error);
      throw new Error('The AI model failed to translate the text.');
    }
  }
);

/**
 * An exported wrapper function that can be called from server components or other server-side code.
 * @param input The text and languages for the translation.
 * @returns The translated text.
 */
export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  return translateTextFlow(input);
}
