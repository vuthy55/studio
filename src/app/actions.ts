
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TranslateTextSchema = z.object({
  text: z.string(),
  fromLanguage: z.string(),
  toLanguage: z.string(),
});

export async function translateText(input: z.infer<typeof TranslateTextSchema>) {
  const { text, fromLanguage, toLanguage } = input;
  const prompt = `Translate the following text from ${fromLanguage} to ${toLanguage}. Only provide the translated text, with no additional commentary or explanations.\n\nText to translate: "${text}"`;
  
  try {
    const llmResponse = await ai.generate({
      prompt: prompt,
      output: {
        format: 'text',
      },
    });

    return { translatedText: llmResponse.text };
  } catch (error) {
    console.error("Translation failed in Server Action:", error);
    // It's often better to return a structured error than to throw
    return { error: 'Translation failed.' };
  }
}
