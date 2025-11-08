

'use server';

import { ai } from '@/ai/genkit';
import { TranslateTextInputSchema, TranslateTextOutputSchema, type TranslateTextInput, type TranslateTextOutput } from './types';
import { getAppSettingsAction } from '@/actions/settings';


const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async ({ text, fromLanguage, toLanguage }) => {
    const settings = await getAppSettingsAction();

    try {
      // First attempt with the primary model
      const {output} = await ai.generate({
          prompt: `Translate the following text from ${fromLanguage} to ${toLanguage}: ${text}`,
          model: `googleai/${settings.aiModelFlash}`,
          output: {
              schema: TranslateTextOutputSchema,
          },
      });
      return output!;
    } catch (error) {
      console.warn(`Primary model (${settings.aiModelFlash}) failed. Retrying with fallback.`, error);
      // Fallback to a different model on any error
      const {output} = await ai.generate({
          prompt: `Translate the following text from ${fromLanguage} to ${toLanguage}: ${text}`,
          model: `googleai/${settings.aiModelPro}`,
          output: {
              schema: TranslateTextOutputSchema,
          },
      });
      return output!;
    }
  }
);


export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  return translateTextFlow(input);
}
