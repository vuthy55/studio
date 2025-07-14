
'use server';
/**
 * @fileOverview This file is no longer in use. The pronunciation assessment logic
 * has been moved directly into the client-side component in `src/app/page.tsx`
 * to allow the Azure SDK to control the microphone directly. This is a more
 * robust and simpler implementation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AssessPronunciationInputSchema = z.object({
  audioDataUri: z.string(),
  referenceText: z.string(),
  lang: z.string(),
});
export type AssessPronunciationInput = z.infer<typeof AssessPronunciationInputSchema>;

const AssessPronunciationOutputSchema = z.object({
  accuracyScore: z.number(),
  fluencyScore: z.number(),
  completenessScore: z.number(),
  pronScore: z.number(),
  passed: z.boolean(),
});
export type AssessPronunciationOutput = z.infer<typeof AssessPronunciationOutputSchema>;


export async function assessPronunciation(input: AssessPronunciationInput): Promise<AssessPronunciationOutput> {
  // This flow is deprecated and should not be called.
  // Returning a default failure state to prevent crashes if it is called somehow.
  console.warn("DEPRECATED: assessPronunciation flow was called. This logic has been moved to the client.");
  return Promise.resolve({
    accuracyScore: 0,
    fluencyScore: 0,
    completenessScore: 0,
    pronScore: 0,
    passed: false,
  });
}
