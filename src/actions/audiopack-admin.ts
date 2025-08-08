

'use server';

import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { languageToLocaleMap } from '@/lib/utils';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { ai } from '@/ai/genkit';
import wav from 'wav';
import { googleAI } from '@genkit-ai/googleai';

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

export interface LanguagePackGenerationMetadata {
    id: LanguageCode;
    name: string;
    generatedCount: number;
    totalCount: number;
    lastGeneratedAt: string; // ISO String
}


const MAX_RETRIES = 3;
const METADATA_FOLDER = 'audio-packs-metadata';

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

const calculateTotalAudioFiles = () => {
    let total = 0;
    phrasebook.forEach(topic => {
        topic.phrases.forEach(phrase => {
            total++; 
            if (phrase.answer) {
                total++; 
            }
        });
    });
    return total;
};

const totalAudioFiles = calculateTotalAudioFiles();


async function saveGenerationMetadata(bucket: any, metadata: LanguagePackGenerationMetadata) {
    const fileName = `${METADATA_FOLDER}/${metadata.id}.json`;
    const file = bucket.file(fileName);
    await file.save(JSON.stringify(metadata), {
        contentType: 'application/json',
    });
}

export async function getGenerationMetadata(): Promise<LanguagePackGenerationMetadata[]> {
    try {
        const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
        const [files] = await bucket.getFiles({ prefix: `${METADATA_FOLDER}/` });
        
        const metadataPromises = files.map(async (file) => {
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
            console.error(`[AudioPack] Failed to generate audio for phrase "${phrase.id}" (${lang}, Attempt ${attempt}):`, error);
            failedPhrases.push(phrase.id);
          }
        }

        if (phrase.answer) {
          const answerTextToSpeak = getTranslation(phrase.answer);
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
              console.error(`[AudioPack] Failed to generate audio for answer of "${phrase.id}" (${lang}, Attempt ${attempt}):`, error);
              failedPhrases.push(`${phrase.id}-ans`);
            }
          }
        }
      });
      
      await Promise.all(generationPromises);
      
      generatedCount = totalAudioFiles - failedPhrases.length;

      if (failedPhrases.length === 0) {
        try {
          const fileName = `audio-packs/${lang}.json`;
          const file = bucket.file(fileName);
          await file.save(JSON.stringify(audioPack), {
            contentType: 'application/json',
          });
          
          finalMessage = `Success!`;
          success = true;
          console.log(`[AudioPack] Success for ${lang} on attempt ${attempt}.`);
          break; 
        } catch (storageError) {
          console.error(`[AudioPack] Firebase Storage error for ${lang}:`, storageError);
          finalMessage = 'Failed to save to storage.';
          success = false;
          break; 
        }
      } else {
        finalMessage = `Attempt ${attempt} failed. Retrying...`;
        if (attempt < MAX_RETRIES) {
          console.log(`[AudioPack] Retrying for ${lang}...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); 
        } else {
           finalMessage = `Failed after ${MAX_RETRIES} attempts.`;
           console.error(`[AudioPack] Final failure for ${lang} after ${MAX_RETRIES} attempts.`);
        }
      }
    }
    
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

export async function applyFreeLanguagesToAllUsers(): Promise<{success: boolean, error?: string}> {
    try {
        const freePacks = await getFreeLanguagePacks();
        if (freePacks.length === 0) {
            return { success: true };
        }
        
        const usersRef = db.collection('users');
        const usersSnapshot = await usersRef.get();
        
        const batchPromises = [];
        let batch = db.batch();
        let count = 0;

        for (const userDoc of usersSnapshot.docs) {
            batch.update(userDoc.ref, {
                unlockedLanguages: FieldValue.arrayUnion(...freePacks),
                downloadedPacks: FieldValue.arrayUnion(...freePacks),
            });
            count++;
            if (count === 499) {
                batchPromises.push(batch.commit());
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            batchPromises.push(batch.commit());
        }

        await Promise.all(batchPromises);
        
        return { success: true };
    } catch (error: any) {
        console.error("Error applying free languages to all users:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
