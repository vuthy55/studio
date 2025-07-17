
'use server';
/**
 * @fileOverview A simple Genkit flow for testing the connection to the AI model.
 */

import {ai} from '@/ai/genkit';
import {googleAI} from '@genkit-ai/googleai';

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
    // The googleAI() plugin in genkit.ts automatically uses the GEMINI_API_KEY 
    // from the environment variables. We just need to reference the model.
    console.log('Calling AI model in testFlow...');
    const {output} = await ai.generate({
      model: googleAI('gemini-pro'),
      prompt: 'Tell me a one-sentence joke.',
    });

    if (!output) {
      throw new Error('Test flow returned no output.');
    }

    return output.text;
  }
);
