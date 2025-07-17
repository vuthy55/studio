
'use server';

import {ai} from '@/ai/genkit';

export async function runTestFlow(name: string): Promise<string> {
  const llmResponse = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: `Tell me a joke about ${name}.`,
  });

  return llmResponse.text;
}
