
'use server';

import { phrasebook, type LanguageCode } from '@/lib/data';
import { languageToLocaleMap } from '@/lib/utils';
import { ai } from '@/ai/genkit';
import wav from 'wav';
import { googleAI } from '@genkit-ai/googleai';

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

export interface AudioPackResult {
    audioPack: AudioPack;
    size: number; // size in bytes
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

    let bufs: any[] = [];
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

/**
 * Generates an "audio pack" for a given language.
 * This involves iterating through the entire phrasebook and generating TTS audio
 * for each phrase and its corresponding answer, then returning it as a single object.
 *
 * @param lang - The language code for which to generate the audio pack.
 * @returns A promise that resolves to an AudioPack object.
 */
export async function getLanguageAudioPack(lang: LanguageCode): Promise<AudioPackResult> {
  const audioPack: AudioPack = {};
  const locale = languageToLocaleMap[lang];

  if (!locale) {
    throw new Error(`Unsupported language for audio pack generation: ${lang}`);
  }

  // Helper to get the correct text for a given phrase and language
  const getTranslation = (textObj: any, lang: LanguageCode) => {
    if (lang === 'english') {
      return textObj.english;
    }
    return textObj.translations[lang] || textObj.english;
  };

  const allPhrases = phrasebook.flatMap(topic => topic.phrases);
  
  const generationPromises = allPhrases.map(async (phrase) => {
    const textToSpeak = getTranslation(phrase, lang);
    if (textToSpeak) {
      try {
        const { media } = await ai.generate({
          model: googleAI.model('gemini-2.5-flash-preview-tts'),
          config: { responseModalities: ['AUDIO'] },
          prompt: textToSpeak,
        });
        if (media?.url) {
          const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
          audioPack[phrase.id] = 'data:audio/wav;base64,' + await toWav(audioBuffer);
        }
      } catch (error) {
        console.error(`Failed to generate audio for phrase "${phrase.id}" in ${lang}:`, error);
      }
    }

    if (phrase.answer) {
        const answerTextToSpeak = getTranslation(phrase.answer, lang);
         if (answerTextToSpeak) {
            try {
              const { media } = await ai.generate({
                model: googleAI.model('gemini-2.5-flash-preview-tts'),
                config: { responseModalities: ['AUDIO'] },
                prompt: answerTextToSpeak,
              });
              if (media?.url) {
                const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
                audioPack[`${phrase.id}-ans`] = 'data:audio/wav;base64,' + await toWav(audioBuffer);
              }
            } catch (error) {
                console.error(`Failed to generate audio for answer of phrase "${phrase.id}" in ${lang}:`, error);
            }
        }
    }
  });

  await Promise.all(generationPromises);

  const size = Buffer.from(JSON.stringify(audioPack)).length;

  return { audioPack, size };
}
