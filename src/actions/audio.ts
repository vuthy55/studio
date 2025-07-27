
'use server';

import { phrasebook, type LanguageCode, type Topic, languages } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';
import { db, storage } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserProfile } from '@/lib/types';


export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

export interface AudioPackResult {
    audioPack: AudioPack;
    size: number; // size in bytes
}

interface TopicStats {
    totalPhrases: number;
    generatedAudio: number;
}

export interface AudioPackMetadata {
    id: string;
    language: string;
    downloadUrl: string;
    size: number;
    updatedAt: string | FieldValue; // Send ISO string to client
    topicStats: Record<string, TopicStats>;
}


/**
 * Retrieves the metadata for all generated audio packs.
 * This is a secure server action for admin use.
 */
export async function getAudioPacks(): Promise<AudioPackMetadata[]> {
    const packsRef = db.collection('audioPacks');
    const snapshot = await packsRef.get();
    if (snapshot.empty) {
        return [];
    }
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const updatedAt = data.updatedAt;
        
        // Convert Timestamp to ISO string for client-side compatibility
        const safeUpdatedAt = (updatedAt instanceof Timestamp) 
            ? updatedAt.toDate().toISOString() 
            : typeof updatedAt === 'string' ? updatedAt : new Date().toISOString();

        return {
            ...data,
            id: doc.id,
            updatedAt: safeUpdatedAt,
        } as AudioPackMetadata
    });
}


/**
 * Generates audio packs for a given list of languages, uploads them to Cloud Storage,
 * and saves the metadata to Firestore. This is an admin-only server action.
 *
 * @param langs - An array of language codes for which to generate audio packs.
 * @returns A promise that resolves to an object indicating success or failure.
 */
export async function generateAndUploadAudioPacks(langs: LanguageCode[]): Promise<{success: boolean, error?: string}> {
  if (!langs || langs.length === 0) {
    return { success: false, error: "No languages selected for audio pack generation." };
  }
  
  console.log(`[AUDIO GEN] Starting generation for languages: ${langs.join(', ')}`);

  const generateSpeechWithRetry = async (text: string, locale: string, phraseIdForLog: string, langForLog: string) => {
    const MAX_RETRIES = 3;
    let lastError: any = null;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const { audioDataUri } = await generateSpeech({ text, lang: locale, voice: 'default' });
            return audioDataUri; // Success
        } catch (error) {
            lastError = error;
            console.warn(`[AUDIO GEN] Attempt ${i + 1}/${MAX_RETRIES} failed for phrase "${phraseIdForLog}" in ${langForLog}. Retrying...`);
            await new Promise(res => setTimeout(res, 500)); // Wait before retrying
        }
    }
    // If all retries fail, throw the last captured error
    throw new Error(`Failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  };


  for (const lang of langs) {
      console.log(`[AUDIO GEN] Processing language: ${lang}`);
      const audioPack: AudioPack = {};
      const topicStats: Record<string, TopicStats> = {};
      const locale = languageToLocaleMap[lang];

      if (!locale) {
        console.error(`[AUDIO GEN] Unsupported language for audio pack generation: ${lang}`);
        continue; // Skip to the next language
      }

      // Initialize stats for each topic
      phrasebook.forEach(topic => {
        topicStats[topic.id] = {
            totalPhrases: topic.phrases.length + topic.phrases.filter(p => p.answer).length,
            generatedAudio: 0,
        };
      });

      const getTranslation = (textObj: any, langCode: LanguageCode) => {
        if (langCode === 'english') {
          return textObj.english;
        }
        return textObj.translations[langCode] || textObj.english;
      };
      
      const allPhrases = phrasebook.flatMap(topic => topic.phrases.map(phrase => ({...phrase, topicId: topic.id})));

      const generationPromises = allPhrases.map(async (phrase) => {
        const textToSpeak = getTranslation(phrase, lang);
        if (textToSpeak) {
          try {
            const audioDataUri = await generateSpeechWithRetry(textToSpeak, locale, phrase.id, lang);
            audioPack[phrase.id] = audioDataUri;
            topicStats[phrase.topicId].generatedAudio++;
          } catch (error) {
            console.error(`[AUDIO GEN] Failed to generate audio for phrase "${phrase.id}" in ${lang}:`, error);
          }
        }

        if (phrase.answer) {
            const answerTextToSpeak = getTranslation(phrase.answer, lang);
            if (answerTextToSpeak) {
                try {
                    const audioDataUri = await generateSpeechWithRetry(answerTextToSpeak, locale, `${phrase.id}-ans`, lang);
                    audioPack[`${phrase.id}-ans`] = audioDataUri;
                    topicStats[phrase.topicId].generatedAudio++;
                } catch (error) {
                    console.error(`[AUDIO GEN] Failed to generate audio for answer of phrase "${phrase.id}" in ${lang}:`, error);
                }
            }
        }
      });

      await Promise.all(generationPromises);
      
      const fileName = `audio-packs/${lang}.json`;
      const packContent = JSON.stringify(audioPack);
      const buffer = Buffer.from(packContent);
      const size = buffer.length;

      try {
          // Upload to Firebase Storage
          console.log(`[AUDIO GEN] Uploading pack for ${lang} to Firebase Storage at ${fileName}`);
          const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
          if (!bucketName) {
            throw new Error("Firebase Storage bucket name is not configured.");
          }
          const bucket = storage.bucket(bucketName);
          const file = bucket.file(fileName);
          
          await file.save(buffer, {
              contentType: 'application/json',
              public: true, // Make the file public
          });
          
          // Use the public URL, which is the standard and correct way.
          const downloadUrl = file.publicUrl();
          console.log(`[AUDIO GEN] Upload successful. Public URL: ${downloadUrl}`);

          // Save metadata to Firestore
          const metadataDocRef = db.collection('audioPacks').doc(lang);
          const metadata = {
              id: lang,
              language: languages.find(l => l.value === lang)?.label || lang,
              downloadUrl,
              size,
              updatedAt: FieldValue.serverTimestamp(),
              topicStats,
          };
          await metadataDocRef.set(metadata, { merge: true });
          console.log(`[AUDIO GEN] Firestore metadata saved for ${lang}.`);
          
      } catch(error: any) {
          console.error(`[AUDIO GEN] Error uploading pack for ${lang}:`, error);
          // Return failure for the whole operation if one language fails
          return { success: false, error: `Failed to upload pack for ${lang}: ${error.message}` };
      }
  }

  // If the loop completes without returning an error, it was successful.
  return { success: true };
}
