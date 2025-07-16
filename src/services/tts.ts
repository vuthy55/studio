
'use server';
/**
 * @fileOverview A Text-to-Speech (TTS) service using Azure Cognitive Services.
 *
 * - generateSpeech - A function that handles the TTS process.
 * - GenerateSpeechInput - The input type for the generateSpeech function.
 * - GenerateSpeechOutput - The return type for the generateSpeech function.
 */
import { z } from 'zod';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const GenerateSpeechInputSchema = z.object({
  text: z.string().describe('The text to be converted to speech.'),
  lang: z.string().describe('The language code for the speech synthesis.'),
  voice: z
    .enum(['default', 'male', 'female'])
    .optional()
    .describe('The desired voice for the speech synthesis.'),
});
export type GenerateSpeechInput = z.infer<typeof GenerateSpeechInputSchema>;

const GenerateSpeechOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The generated audio as a data URI. Expected format: 'data:audio/wav;base64,<encoded_data>'"
    ),
});
export type GenerateSpeechOutput = z.infer<typeof GenerateSpeechOutputSchema>;

export async function generateSpeech(
  input: GenerateSpeechInput
): Promise<GenerateSpeechOutput> {
  const { text, lang, voice } = input;
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.NEXT_PUBLIC_AZURE_TTS_KEY!,
    process.env.NEXT_PUBLIC_AZURE_TTS_REGION!
  );
  speechConfig.speechSynthesisLanguage = lang;

  // Select a voice based on language and user preference
  const voiceMap: Record<string, { male: string; female: string }> = {
    'th-TH': { male: 'th-TH-NiwatNeural', female: 'th-TH-PremwadeeNeural' },
    'vi-VN': { male: 'vi-VN-HoaiMyNeural', female: 'vi-VN-NamMinhNeural' },
    'km-KH': { male: 'km-KH-PisethNeural', female: 'km-KH-SreymomNeural' },
    'fil-PH': {
      male: 'fil-PH-AngeloNeural',
      female: 'fil-PH-BlessicaNeural',
    },
    'ms-MY': { male: 'ms-MY-OsmanNeural', female: 'ms-MY-YasminNeural' },
    'id-ID': { male: 'id-ID-ArdiNeural', female: 'id-ID-GadisNeural' },
    'my-MM': { male: 'my-MM-NilarNeural', female: 'my-MM-ThihaNeural' },
    'lo-LA': {
      male: 'lo-LA-KeomanyNeural',
      female: 'lo-LA-ChanthavongNeural',
    },
    'ta-IN': { male: 'ta-IN-ValluvarNeural', female: 'ta-IN-PallaviNeural' },
    'zh-CN': { male: 'zh-CN-YunxiNeural', female: 'zh-CN-XiaoxiaoNeural' },
    'fr-FR': { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
    'es-ES': { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
    'it-IT': { male: 'it-IT-DiegoNeural', female: 'it-IT-ElsaNeural' },
    'en-US': { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' },
  };

  if (voice && voice !== 'default' && voiceMap[lang]) {
    speechConfig.speechSynthesisVoiceName = voiceMap[lang][voice];
  }

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

  const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
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
