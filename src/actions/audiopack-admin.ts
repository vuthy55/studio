
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
  missingPhrases?: string[];
}

const MAX_RETRIES = 3;

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
    let missingPhrases: string[] = [];
    
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

      if (failedPhrases.length === 0) {
        // Successfully generated all audio, save to storage
        try {
          const fileName = `audio-packs/${lang}.json`;
          const file = bucket.file(fileName);
          await file.save(JSON.stringify(audioPack), {
            contentType: 'application/json',
            // Set cache control for public read access if needed
            // public: true,
            // metadata: { cacheControl: 'public, max-age=31536000' }
          });
          
          finalMessage = `Successfully generated and saved pack to ${fileName}.`;
          success = true;
          missingPhrases = [];
          console.log(`[AudioPack] Success for ${lang} on attempt ${attempt}.`);
          break; // Exit retry loop
        } catch (storageError) {
          console.error(`[AudioPack] Firebase Storage error for ${lang}:`, storageError);
          finalMessage = 'Failed to save the generated pack to storage.';
          missingPhrases = []; // Storage error, not a generation error
          break; // Don't retry on storage failure
        }
      } else {
        // Some phrases failed, prepare for next attempt or final failure
        finalMessage = `Attempt ${attempt} failed. Missing ${failedPhrases.length} audio files.`;
        missingPhrases = failedPhrases;
        if (attempt < MAX_RETRIES) {
          console.log(`[AudioPack] Retrying for ${lang}...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
        } else {
           console.error(`[AudioPack] Final failure for ${lang} after ${MAX_RETRIES} attempts.`);
        }
      }
    }
    
    results.push({ language: lang, success, message: finalMessage, missingPhrases });
  }

  return results;
}
