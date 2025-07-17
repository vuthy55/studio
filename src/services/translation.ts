'use server';

import { ai } from '@/ai/genkit';

export interface TranslateTextInput {
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export interface TranslateTextOutput {
  translatedText: string;
}

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  const { text, fromLanguage, toLanguage } = input;

  const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${fromLanguage} to ${toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation. Text to translate: "${text}"`;

  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.0-pro',
      prompt: prompt,
      config: {
        temperature: 0.1,
      },
       safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
      ],
    });
    
    const translatedText = response.text.trim();
    return { translatedText };
  } catch (error: any) {
    console.error('Error calling Genkit for translation:', error.message);
    throw new Error('Failed to translate text.');
  }
}
