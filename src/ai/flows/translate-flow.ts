
'use server';

import { ai } from '@/ai/genkit';
import { TranslateTextInputSchema, TranslateTextOutputSchema, type TranslateTextInput, type TranslateTextOutput } from './types';


const translateFlow = ai.defineFlow(
  {
    name: 'translateFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async (input) => {
    const { text, fromLanguage, toLanguage } = input;
    
    if (fromLanguage.trim().toLowerCase() === toLanguage.trim().toLowerCase()) {
        return { translatedText: text };
    }

    const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${fromLanguage} to ${toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation.

Text to translate:
${text}`;

    const safetySettings = [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ];
    
    const config = { temperature: 0.1 };

    try {
      // First attempt with the primary model
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        prompt,
        config,
        safetySettings,
      });
      return { translatedText: response.text.trim() };
    } catch (error: any) {
      // If it's an overload error, try the fallback model
      if (error.message && (error.message.includes('503') || /overloaded/i.test(error.message))) {
        console.warn('Primary model overloaded, switching to fallback.');
        const fallbackResponse = await ai.generate({
          model: 'googleai/gemini-2.0-flash',
          prompt,
          config,
          safetySettings,
        });
        return { translatedText: fallbackResponse.text.trim() };
      }
      // For any other error, re-throw it
      throw error;
    }
  }
);


export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  return translateFlow(input);
}
