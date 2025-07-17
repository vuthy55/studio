/**
 * @fileoverview This file initializes the Genkit AI instance with the Google AI plugin.
 * It ensures that the AI object is a singleton that can be used across the application.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
});
