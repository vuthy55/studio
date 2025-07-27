
'use server';

import { phrasebook, type LanguageCode, type Topic, languages } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';
import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';

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
    updatedAt: FieldValue;
    topicStats: Record<string, TopicStats>;
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
  
  for (const lang of langs) {
      const audioPack: AudioPack = {};
      const topicStats: Record<string, TopicStats> = {};
      const locale = languageToLocaleMap[lang];

      if (!locale) {
        console.error(`Unsupported language for audio pack generation: ${lang}`);
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
            const { audioDataUri } = await generateSpeech({ text: textToSpeak, lang: locale, voice: 'default' });
            audioPack[phrase.id] = audioDataUri;
            topicStats[phrase.topicId].generatedAudio++;
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
                    topicStats[phrase.topicId].generatedAudio++;
                } catch (error) {
                    console.error(`Failed to generate audio for answer of phrase "${phrase.id}" in ${lang}:`, error);
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
          const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
          if (!bucketName) {
            throw new Error("Firebase Storage bucket name is not configured.");
          }
          const bucket = getStorage().bucket(bucketName);
          const file = bucket.file(fileName);
          await file.save(buffer, {
              contentType: 'application/json',
              public: true, // Make the file public
          });
          
          // Use the public URL
          const downloadUrl = file.publicUrl();

          // Save metadata to Firestore
          const metadataDocRef = db.collection('audioPacks').doc(lang);
          const metadata: AudioPackMetadata = {
              id: lang,
              language: languages.find(l => l.value === lang)?.label || lang,
              downloadUrl,
              size,
              updatedAt: FieldValue.serverTimestamp(),
              topicStats,
          };
          await metadataDocRef.set(metadata);
          
      } catch(error: any) {
          console.error(`Error uploading pack for ${lang}:`, error);
          // Return failure for the whole operation if one language fails
          return { success: false, error: `Failed to upload pack for ${lang}: ${error.message}` };
      }
  }

  // If the loop completes without returning an error, it was successful.
  return { success: true };
}
