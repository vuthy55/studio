'use server';

import {ai} from '@/ai/genkit';
import {z} from 'zod';

export async function runTestFlow(name: string): Promise<string> {
  console.log('Running test flow for:', name);
  try {
    const llmResponse = await ai.generate({
      model: 'gemini-pro',
      prompt: `Tell me a joke about ${name}.`,
    });

    const text = llmResponse.text;
    console.log('Test flow response:', text);
    return text;
  } catch (e: any) {
    console.error('Genkit test flow failed.', e);
    throw new Error('Genkit test flow failed.', {cause: e});
  }
}
