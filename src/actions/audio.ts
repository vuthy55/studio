
'use server';

import { phrasebook, type LanguageCode } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

/**
 * Generates an "audio pack" for a given language.
 * This involves iterating through the entire phrasebook and generating TTS audio
 * for each phrase and its corresponding answer, then returning it as a single object.
 *
 * @param lang - The language code for which to generate the audio pack.
 * @returns A promise that resolves to an AudioPack object.
 */
export async function getLanguageAudioPack(lang: LanguageCode): Promise<AudioPack> {
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
    // Generate audio for the main phrase
    const textToSpeak = getTranslation(phrase, lang);
    if (textToSpeak) {
      try {
        const { audioDataUri } = await generateSpeech({ text: textToSpeak, lang: locale, voice: 'default' });
        audioPack[phrase.id] = audioDataUri;
      } catch (error) {
        console.error(`Failed to generate audio for phrase "${phrase.id}" in ${lang}:`, error);
        // We will skip this phrase on error and continue with the rest.
      }
    }

    // Also generate audio for the answer if it exists
    if (phrase.answer) {
        const answerTextToSpeak = getTranslation(phrase.answer, lang);
         if (answerTextToSpeak) {
            try {
                const { audioDataUri } = await generateSpeech({ text: answerTextToSpeak, lang: locale, voice: 'default' });
                // Use a unique key for the answer audio
                audioPack[`${phrase.id}-ans`] = audioDataUri;
            } catch (error) {
                console.error(`Failed to generate audio for answer of phrase "${phrase.id}" in ${lang}:`, error);
            }
        }
    }
  });

  await Promise.all(generationPromises);

  return audioPack;
}
