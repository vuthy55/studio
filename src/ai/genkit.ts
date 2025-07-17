'use server';

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    'GEMINI_API_KEY is not set. Genkit flows will not work. Please add it to your .env file.'
  );
}

export const ai = genkit({
  plugins: [googleAI()],
  logSinks: [],
  enableTracing: true,
});