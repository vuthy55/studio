'use server';
/**
 * @fileOverview A flow for assessing pronunciation using Azure Speech SDK.
 * 
 * - assessPronunciation - A function that handles the pronunciation assessment.
 * - AssessPronunciationInput - The input type for the assessPronunciation function.
 * - AssessPronunciationOutput - The return type for the assessPronunciation function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const AssessPronunciationInputSchema = z.object({
  audioDataUri: z.string().describe("A recording of the user's speech, as a data URI that must include a MIME type and use Base64 encoding."),
  referenceText: z.string().describe('The text the user was supposed to say.'),
  lang: z.string().describe('The language code for the pronunciation assessment.'),
});
export type AssessPronunciationInput = z.infer<typeof AssessPronunciationInputSchema>;

const AssessPronunciationOutputSchema = z.object({
  accuracyScore: z.number().describe('The accuracy of the pronunciation.'),
  fluencyScore: z.number().describe('The fluency of the speech.'),
  completenessScore: z.number().describe('The completeness of the speech.'),
  pronScore: z.number().describe('The overall pronunciation score.'),
  passed: z.boolean().describe('Whether the user passed the assessment.'),
});
export type AssessPronunciationOutput = z.infer<typeof AssessPronunciationOutputSchema>;


export async function assessPronunciation(input: AssessPronunciationInput): Promise<AssessPronunciationOutput> {
  return pronunciationAssessmentFlow(input);
}

const pronunciationAssessmentFlow = ai.defineFlow(
  {
    name: 'pronunciationAssessmentFlow',
    inputSchema: AssessPronunciationInputSchema,
    outputSchema: AssessPronunciationOutputSchema,
  },
  async ({ audioDataUri, referenceText, lang }) => {
    if (!process.env.AZURE_TTS_KEY || !process.env.AZURE_TTS_REGION) {
      throw new Error("Azure TTS credentials not configured.");
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_TTS_KEY,
      process.env.AZURE_TTS_REGION
    );

    const base64Data = audioDataUri.substring(audioDataUri.indexOf(',') + 1);
    const audioBuffer = Buffer.from(base64Data, 'base64');
    
    // Create a push stream from the audio buffer.
    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioBuffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true
    );
    pronunciationAssessmentConfig.enableProsodyAssessment = true;

    pronunciationAssessmentConfig.applyTo(recognizer);

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(result => {
        recognizer.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
          const accuracyScore = assessment.accuracyScore;
          const fluencyScore = assessment.fluencyScore;
          const completenessScore = assessment.completenessScore;
          const pronScore = assessment.pronScore;
          
          // Define "passing" as having an accuracy score of 80 or higher.
          const passed = accuracyScore >= 80;

          resolve({
            accuracyScore,
            fluencyScore,
            completenessScore,
            pronScore,
            passed,
          });
        } else {
          console.error(`Recognition failed. Reason: ${result.reason}, Details: ${result.errorDetails}`);
          reject(new Error(`Speech recognition failed: ${result.errorDetails}`));
        }
      }, err => {
        recognizer.close();
        console.error(`Recognition error: ${err}`);
        reject(new Error(`Speech recognition error: ${err}`));
      });
    });
  }
);
