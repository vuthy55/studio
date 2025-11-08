

'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAppSettingsAction } from '@/actions/settings';


const testFlow = ai.defineFlow(
  {
    name: 'testFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (name) => {
    const settings = await getAppSettingsAction();
    const {output} = await ai.generate({
      prompt: `You are a helpful AI assistant. Say hello to ${name}.`,
      model: `googleai/${settings.aiModelFlash}`,
    });
    return output!;
  }
);

export async function runTestFlow(name: string): Promise<string> {
  return testFlow(name);
}
