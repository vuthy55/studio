
'use server';

import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { generateSpeech } from '@/services/tts';
import { languageToLocaleMap } from '@/lib/utils';
import type { Timestamp } from 'firebase-admin/firestore';

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
    // User-facing metadata for download list
}

export interface LanguagePackGenerationMetadata {
    id: LanguageCode;
    name: string;
    generatedCount: number;
    totalCount: number;
    lastGeneratedAt: string; // ISO String
}


const MAX_RETRIES = 3;
const METADATA_FOLDER = 'audio-packs-metadata';


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
 * Saves generation metadata to Firebase Storage.
 */
async function saveGenerationMetadata(bucket: any, metadata: LanguagePackGenerationMetadata) {
    const fileName = `${METADATA_FOLDER}/${metadata.id}.json`;
    const file = bucket.file(fileName);
    await file.save(JSON.stringify(metadata), {
        contentType: 'application/json',
    });
}

/**
 * Fetches all generation metadata files from Firebase Storage.
 */
export async function getGenerationMetadata(): Promise<LanguagePackGenerationMetadata[]> {
    try {
        const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
        const [files] = await bucket.getFiles({ prefix: `${METADATA_FOLDER}/` });
        
        const metadataPromises = files.map(async (file) => {
            // Skip directory placeholders
            if (file.name.endsWith('/')) return null;
            
            const [contents] = await file.download();
            try {
                return JSON.parse(contents.toString());
            } catch (e) {
                console.error(`Failed to parse metadata for ${file.name}:`, e);
                return null;
            }
        });

        const allMetadata = (await Promise.all(metadataPromises)).filter(Boolean);
        return allMetadata as LanguagePackGenerationMetadata[];

    } catch (error) {
        console.error("Error fetching generation metadata:", error);
        return [];
    }
}


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
    
    // Always save metadata, regardless of success or failure
    const langInfo = phrasebook.find(p => p.id === 'greetings')?.phrases.find(ph => ph.id === 'g-1')?.translations[lang];
    await saveGenerationMetadata(bucket, {
        id: lang,
        name: langInfo || lang,
        generatedCount,
        totalCount: totalAudioFiles,
        lastGeneratedAt: new Date().toISOString(),
    });

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


/**
 * Applies the currently configured free language packs to all existing users.
 * This will overwrite the `unlockedLanguages` field for every user.
 * @returns Promise indicating success or failure.
 */
export async function applyFreeLanguagesToAllUsers(): Promise<{ success: boolean; error?: string }> {
  try {
    const freePacks = await getFreeLanguagePacks();
    if (freePacks.length === 0) {
      return { success: false, error: "No free languages are configured. Please select at least one." };
    }

    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.get();

    if (querySnapshot.empty) {
      return { success: true }; // No users to update.
    }

    // Process in batches of 500 (Firestore's limit for a single batch)
    const batchSize = 500;
    const userDocs = querySnapshot.docs;
    
    for (let i = 0; i < userDocs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = userDocs.slice(i, i + batchSize);
      
      chunk.forEach(doc => {
        const userRef = usersRef.doc(doc.id);
        batch.update(userRef, { unlockedLanguages: freePacks });
      });
      
      await batch.commit();
      console.log(`Updated languages for a batch of ${chunk.length} users.`);
    }
    
    return { success: true };

  } catch (error: any) {
    console.error("Error applying free languages to all users:", error);
    return { success: false, error: "An unexpected server error occurred during the bulk update." };
  }
}
