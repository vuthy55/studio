import {genkit, type GenkitError} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import next from '@genkit-ai/next';

export const ai = genkit({
  plugins: [
    next(),
    googleAI({
      apiVersion: 'v1beta',
    }),
  ],
  logSinks: [
    {
      log(span) {
        if (span.state.status === 'error') {
          const err = span.state.error as GenkitError;
          console.error(
            `[Genkit] ${span.name} failed with status ${err.status}: ${err.message}`
          );
        }
      },
      async flush() {},
    },
  ],
  enableTracing: true,
});
