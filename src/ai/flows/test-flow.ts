
'use server';
/**
 * @fileOverview A simple Genkit flow for testing the connection to the AI model.
 */

import {ai} from '@/ai/genkit';

export async function runTestFlow(): Promise<string> {
  console.log('Running Genkit Test Flow...');
  try {
    const result = await testFlow();
    console.log('Test Flow successful:', result);
    return result;
  } catch (error) {
    console.error('Error in testFlow:', error);
    throw new Error('Genkit test flow failed.');
  }
}

const testFlow = ai.defineFlow(
  {
    name: 'testFlow',
  },
  async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in the environment for testFlow.');
    }

    console.log('Calling AI model in testFlow...');
    const llm = ai.getPlugin('googleai')!.getModel('gemini-pro', { apiKey });
    const { output } = await ai.generate({
      model: llm,
      prompt: 'Tell me a one-sentence joke.',
    });

    if (!output) {
      throw new Error('Test flow returned no output.');
    }
    
    return output.text;
  }
);
