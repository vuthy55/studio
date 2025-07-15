
'use server';
/**
 * @fileOverview A Text-to-Speech (TTS) flow using Google's models via Genkit.
 *
 * - generateGoogleSpeech - A function that handles the TTS process.
 * - GenerateGoogleSpeechInput - The input type for the generateGoogleSpeech function.
 * - GenerateGoogleSpeechOutput - The return type for the generateGoogleSpeech function.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';
import wav from 'wav';
import {googleAI} from '@genkit-ai/googleai';

const GenerateGoogleSpeechInputSchema = z.object({
  text: z.string().describe('The text to be converted to speech.'),
});
export type GenerateGoogleSpeechInput = z.infer<typeof GenerateGoogleSpeechInputSchema>;

const GenerateGoogleSpeechOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The generated audio as a data URI. Expected format: 'data:audio/wav;base64,<encoded_data>'"
    ),
});
export type GenerateGoogleSpeechOutput = z.infer<typeof GenerateGoogleSpeechOutputSchema>;

export async function generateGoogleSpeech(
  input: GenerateGoogleSpeechInput
): Promise<GenerateGoogleSpeechOutput> {
  return googleTtsFlow(input);
}

async function toWav(
    pcmData: Buffer,
    channels = 1,
    rate = 24000,
    sampleWidth = 2
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const writer = new wav.Writer({
        channels,
        sampleRate: rate,
        bitDepth: sampleWidth * 8,
      });
  
      let bufs = [] as any[];
      writer.on('error', reject);
      writer.on('data', function (d) {
        bufs.push(d);
      });
      writer.on('end', function () {
        resolve(Buffer.concat(bufs).toString('base64'));
      });
  
      writer.write(pcmData);
      writer.end();
    });
  }

const googleTtsFlow = ai.defineFlow(
  {
    name: 'googleTtsFlow',
    inputSchema: GenerateGoogleSpeechInputSchema,
    outputSchema: GenerateGoogleSpeechOutputSchema,
  },
  async ({text}) => {
    const { media } = await ai.generate({
        model: googleAI.model('gemini-2.5-flash-preview-tts'),
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Algenib' },
            },
          },
        },
        prompt: text,
      });

      if (!media) {
        throw new Error('No audio media returned from Google TTS.');
      }
      
      const audioBuffer = Buffer.from(
        media.url.substring(media.url.indexOf(',') + 1),
        'base64'
      );

      const base64Audio = await toWav(audioBuffer);

    return {
      audioDataUri: `data:audio/wav;base64,${base64Audio}`,
    };
  }
);
