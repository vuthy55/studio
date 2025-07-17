/**
 * @fileoverview This file initializes the Genkit AI instance with the Google AI plugin.
 * It ensures that the AI object is a singleton that can be used across the application.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Log the API key to verify it's loaded. This will only show in the server console.
console.log('GEMINI_API_KEY loaded:', process.env.GEMINI_API_KEY ? 'Yes' : 'No');

export const ai = genkit({
  plugins: [
    googleAI(),
  ],
});
