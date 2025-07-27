
'use server';

import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';

interface AudioPackResult {
  language: LanguageCode;
  success: boolean;
  message: string;
  generatedCount?: number;
  totalCount?: number;
}

export interface LanguagePackMetadata {
    id: LanguageCode;
    name: string;
    size: number;
}

const MAX_RETRIES = 3;

// Calculate the total number of audio files required for a full pack
const calculateTotalAudioFiles = () => {
    let total = 0;
    phrasebook.forEach(topic => {
        topic.phrases.forEach(phrase => {
            total++; // For the phrase itself
            if (phrase.answer) {
                total++; // For the answer
            }
        });
    });
    return total;
};

const totalAudioFiles = calculateTotalAudioFiles();


/**
 * Generates and stores a complete audio pack for a given language.
 * This is a server-side action intended for admin use.
 */
export async function generateLanguagePack(languages: LanguageCode[]): Promise<AudioPackResult[]> {
  const allPhrases = phrasebook.flatMap(topic => topic.phrases);
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  
  const results: AudioPackResult[] = [];

  for (const lang of languages) {
    let success = false;
    let finalMessage = '';
    let generatedCount = 0;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[AudioPack] Attempt ${attempt} for language: ${lang}`);
      const audioPack: Record<string, string> = {};
      const failedPhrases: string[] = [];

      const generationPromises = allPhrases.map(async (phrase) => {
        const getTranslation = (textObj: any) => textObj.translations[lang] || textObj.english;

        const textToSpeak = getTranslation(phrase);
        if (textToSpeak) {
          try {
            const { audioDataUri } = await generateSpeech({ text: textToSpeak, lang: languageToLocaleMap[lang]!, voice: 'default' });
            audioPack[phrase.id] = audioDataUri;
          } catch (error) {
            console.error(`[AudioPack] Failed to generate audio for phrase "${phrase.id}" (${lang}, Attempt ${attempt}):`, error);
            failedPhrases.push(phrase.id);
          }
        }

        if (phrase.answer) {
          const answerTextToSpeak = getTranslation(phrase.answer);
          if (answerTextToSpeak) {
            try {
              const { audioDataUri } = await generateSpeech({ text: answerTextToSpeak, lang: languageToLocaleMap[lang]!, voice: 'default' });
              audioPack[`${phrase.id}-ans`] = audioDataUri;
            } catch (error) {
              console.error(`[AudioPack] Failed to generate audio for answer of "${phrase.id}" (${lang}, Attempt ${attempt}):`, error);
              failedPhrases.push(`${phrase.id}-ans`);
            }
          }
        }
      });
      
      await Promise.all(generationPromises);
      
      generatedCount = totalAudioFiles - failedPhrases.length;

      if (failedPhrases.length === 0) {
        // Successfully generated all audio, save to storage
        try {
          const fileName = `audio-packs/${lang}.json`;
          const file = bucket.file(fileName);
          // Saving the file will overwrite any existing file with the same name.
          await file.save(JSON.stringify(audioPack), {
            contentType: 'application/json',
          });
          
          finalMessage = `Success!`;
          success = true;
          console.log(`[AudioPack] Success for ${lang} on attempt ${attempt}.`);
          break; // Exit retry loop
        } catch (storageError) {
          console.error(`[AudioPack] Firebase Storage error for ${lang}:`, storageError);
          finalMessage = 'Failed to save to storage.';
          success = false;
          break; // Don't retry on storage failure
        }
      } else {
        // Some phrases failed, prepare for next attempt or final failure
        finalMessage = `Attempt ${attempt} failed. Retrying...`;
        if (attempt < MAX_RETRIES) {
          console.log(`[AudioPack] Retrying for ${lang}...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
        } else {
           finalMessage = `Failed after ${MAX_RETRIES} attempts.`;
           console.error(`[AudioPack] Final failure for ${lang} after ${MAX_RETRIES} attempts.`);
        }
      }
    }
    
    results.push({ 
        language: lang, 
        success, 
        message: finalMessage, 
        generatedCount, 
        totalCount: totalAudioFiles 
    });
  }

  return results;
}


const freePacksDocRef = db.collection('settings').doc('freeLanguagePacks');

export async function getFreeLanguagePacks(): Promise<LanguageCode[]> {
    try {
        const docSnap = await freePacksDocRef.get();
        if (docSnap.exists) {
            return docSnap.data()?.codes || [];
        }
        return [];
    } catch (error) {
        console.error("Error getting free language packs:", error);
        return [];
    }
}

export async function setFreeLanguagePacks(codes: LanguageCode[]): Promise<{success: boolean, error?: string}> {
    try {
        await freePacksDocRef.set({ codes });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting free language packs:", error);
        return { success: false, error: 'Failed to update free packs list.' };
    }
}
