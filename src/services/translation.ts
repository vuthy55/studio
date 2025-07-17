
'use server';

import { translateText as genkitTranslateText } from '@/ai/flows/translation-flow';
import type {
  TranslateTextInput,
  TranslateTextOutput,
} from '@/ai/schemas/translation-schema';

/**
 * A service that translates text by calling the Genkit translation flow.
 *
 * @param input The text and languages for the translation.
 * @returns The translated text.
 */
export async function translateText(
  input: TranslateTextInput,
): Promise<TranslateTextOutput> {
  try {
    // Directly call the imported Genkit flow wrapper function.
    // The Genkit flow handles all API interactions.
    const result = await genkitTranslateText(input);
    return result;
  } catch (error) {
    console.error('Error in translation service while calling Genkit flow:', error);
    // Re-throw the error to be handled by the calling component.
    throw new Error('Failed to translate text.');
  }
}
