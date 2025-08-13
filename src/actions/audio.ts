
'use server';

import { phrasebook, type LanguageCode } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';
import { db } from '@/lib/firebase-admin';
import type { SavedPhrase } from '@/lib/types';
import { getStorage } from 'firebase-admin/storage';

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

export interface AudioPackResult {
    audioPack: AudioPack;
    size: number; // size in bytes
}

/**
 * Downloads a pre-generated language audio pack from Firebase Storage.
 * This is a resilient function that returns an empty pack on any error.
 * @param lang The language code of the pack to download.
 * @returns An AudioPackResult object.
 */
export async function downloadLanguagePack(lang: LanguageCode): Promise<AudioPackResult> {
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const file = bucket.file(`audio-packs/${lang}.json`);

  try {
    const [contents] = await file.download();
    const audioPack = JSON.parse(contents.toString()) as AudioPack;
    const size = contents.length;
    return { audioPack, size };
  } catch (error: any) {
    console.error(`[SERVER ACTION] Failed to download or parse audio pack for '${lang}'. Error: ${error.message}`);
    // This is a critical change: always return a valid, empty object on failure
    // to prevent any client-side crashes from destructuring an undefined result.
    if (error.code === 404) {
      console.error(`[SERVER ACTION] Reason: File not found in Firebase Storage at path 'audio-packs/${lang}.json'. Returning empty pack.`);
    }
    return { audioPack: {}, size: 0 };
  }
}

/**
 * Generates an "audio pack" for a given language from the static phrasebook.
 * This involves iterating through the phrasebook and generating TTS audio
 * for each phrase and its corresponding answer.
 *
 * @param lang - The language code for which to generate the audio pack.
 * @returns A promise that resolves to an AudioPackResult object.
 */
export async function getLanguageAudioPack(lang: LanguageCode): Promise<AudioPackResult> {
  const audioPack: AudioPack = {};
  const locale = languageToLocaleMap[lang];

  if (!locale) {
    throw new Error(`Unsupported language for audio pack generation: ${lang}`);
  }

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
        const { audioDataUri } = await generateSpeech({ text: textToSpeak, lang: locale, voice: 'default' });
        audioPack[phrase.id] = audioDataUri;
      } catch (error) {
        console.error(`Failed to generate audio for phrase "${phrase.id}" in ${lang}:`, error);
      }
    }

    if (phrase.answer) {
        const answerTextToSpeak = getTranslation(phrase.answer, lang);
         if (answerTextToSpeak) {
            try {
                const { audioDataUri } = await generateSpeech({ text: answerTextToSpeak, lang: locale, voice: 'default' });
                audioPack[`${phrase.id}-ans`] = audioDataUri;
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


/**
 * Generates an audio pack for a user's saved phrases.
 * @param userId The ID of the user.
 * @returns An AudioPackResult containing audio for all saved phrases.
 */
export async function getSavedPhrasesAudioPack(userId: string): Promise<AudioPackResult> {
    const audioPack: AudioPack = {};

    const savedPhrasesRef = db.collection('users').doc(userId).collection('savedPhrases');
    const snapshot = await savedPhrasesRef.get();

    if (snapshot.empty) {
        return { audioPack: {}, size: 0 };
    }

    const savedPhrases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedPhrase));

    const generationPromises = savedPhrases.map(async (phrase) => {
        const locale = languageToLocaleMap[phrase.toLang];
        if (phrase.toText && locale) {
            try {
                const { audioDataUri } = await generateSpeech({ text: phrase.toText, lang: locale, voice: 'default' });
                audioPack[phrase.id] = audioDataUri;
            } catch (error) {
                console.error(`Failed to generate audio for saved phrase "${phrase.id}":`, error);
            }
        }
    });

    await Promise.all(generationPromises);

    const size = Buffer.from(JSON.stringify(audioPack)).length;

    return { audioPack, size };
}
