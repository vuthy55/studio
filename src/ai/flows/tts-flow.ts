'use server';
/**
 * @fileOverview A Text-to-Speech (TTS) flow using Azure Cognitive Services.
 *
 * - generateSpeech - A function that handles the TTS process.
 * - GenerateSpeechInput - The input type for the generateSpeech function.
 * - GenerateSpeechOutput - The return type for the generateSpeech function.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const GenerateSpeechInputSchema = z.object({
  text: z.string().describe('The text to be converted to speech.'),
  lang: z.string().describe('The language code for the speech synthesis.'),
});
export type GenerateSpeechInput = z.infer<typeof GenerateSpeechInputSchema>;

const GenerateSpeechOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The generated audio as a data URI. Expected format: 'data:audio/wav;base64,<encoded_data>'."
    ),
});
export type GenerateSpeechOutput = z.infer<typeof GenerateSpeechOutputSchema>;

export async function generateSpeech(
  input: GenerateSpeechInput
): Promise<GenerateSpeechOutput> {
  return ttsFlow(input);
}

const ttsFlow = ai.defineFlow(
  {
    name: 'ttsFlow',
    inputSchema: GenerateSpeechInputSchema,
    outputSchema: GenerateSpeechOutputSchema,
  },
  async ({text, lang}) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_TTS_KEY!,
      process.env.AZURE_TTS_REGION!
    );
    speechConfig.speechSynthesisLanguage = lang;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          synthesizer.close();
          if (
            result.reason === sdk.ResultReason.SynthesizingAudioCompleted
          ) {
            resolve(result.audioData);
          } else {
            reject(
              new Error(
                `Speech synthesis canceled, ${result.errorDetails} [${result.reason}]`
              )
            );
          }
        },
        (err) => {
          synthesizer.close();
          reject(err);
        }
      );
    });

    const base64Audio = Buffer.from(audioData).toString('base64');
    return {
      audioDataUri: `data:audio/wav;base64,${base64Audio}`,
    };
  }
);
