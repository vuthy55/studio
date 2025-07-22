
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    'GEMINI_API_KEY is not set. Genkit flows will not work. Please add it to your .env.local file.'
  );
}

export const ai = genkit({
  plugins: [googleAI({apiKey: process.env.GEMINI_API_KEY})],
  logSinks: [],
  enableTracing: true,
  // We will rely on the model specified in the flow itself for now
  // to allow the model listing to work without a default model error.
});
