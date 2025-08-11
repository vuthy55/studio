
'use server';
/**
 * @fileOverview A Genkit flow to translate a meeting summary.
 *
 * This flow takes an existing summary object and a list of target languages,
 * and returns the summary object with translations added for the summary
 * text and each action item.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import type { RoomSummary } from '@/lib/types';
import { db } from '@/lib/firebase-admin';
import { getAppSettingsAction } from '@/actions/settings';
import { FieldValue } from 'firebase-admin/firestore';
import { languages } from '@/lib/data';

// --- Zod Schemas for Input/Output ---

const TranslatedContentSchema = z.object({
    original: z.string(),
    translations: z.record(z.string()).optional(),
});

const RoomSummarySchemaForInput = z.object({
  title: z.string(),
  date: z.string(),
  presentParticipants: z.array(z.object({ name: z.string(), email: z.string(), language: z.string() })),
  absentParticipants: z.array(z.object({ name: z.string(), email: z.string(), language: z.string() })),
  summary: TranslatedContentSchema,
  actionItems: z.array(z.object({
    task: TranslatedContentSchema,
    personInCharge: z.string().optional(),
    dueDate: z.string().optional(),
  })),
  editHistory: z.array(z.any()).optional(),
  allowMoreEdits: z.boolean().optional(),
});

const TranslateSummaryInputSchema = z.object({
  summary: RoomSummarySchemaForInput,
  targetLanguages: z.array(z.string()).describe("A list of language codes (e.g., 'es', 'fr', 'th') to translate the content into."),
  roomId: z.string(),
  userId: z.string(),
});
export type TranslateSummaryInput = z.infer<typeof TranslateSummaryInputSchema>;


const RoomSummarySchemaForOutput = RoomSummarySchemaForInput; // Output is the same shape as input
export type TranslateSummaryOutput = RoomSummary;


// --- Helper Function ---
const generateWithFallback = async (prompt: string, schema: z.ZodType) => {
    try {
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema },
        });
    } catch (error) {
        console.warn("Primary translation model (gemini-1.5-flash) failed. Retrying with fallback.", error);
        return await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-pro',
            output: { schema },
        });
    }
};


// --- Genkit Flow & Prompt ---

const translateSummaryFlow = ai.defineFlow(
  {
    name: 'translateSummaryFlow',
    inputSchema: TranslateSummaryInputSchema,
    outputSchema: RoomSummarySchemaForOutput,
  },
  async ({ summary, targetLanguages }) => {

    const translationPromises = [];
    
    // Dynamically build the Zod schema based on the target languages
    const translationSchema = z.object(
        targetLanguages.reduce((acc, lang) => {
            const langLabel = languages.find(l => l.value === lang)?.label || lang;
            acc[lang] = z.string().describe(`The translated text in ${langLabel}.`);
            return acc;
        }, {} as Record<string, z.ZodString>)
    );


    // Translate the main summary
    translationPromises.push(
      generateWithFallback(`Translate the following text into these languages: ${targetLanguages.join(', ')}.\n\nText: ${summary.summary.original}`, translationSchema)
        .then(res => ({ index: -1, translations: res.output! }))
    );

    // Translate each action item
    summary.actionItems.forEach((item, index) => {
      translationPromises.push(
        generateWithFallback(`Translate the following task into these languages: ${targetLanguages.join(', ')}.\n\nTask: ${item.task.original}`, translationSchema)
          .then(res => ({ index, translations: res.output! }))
      );
    });

    const results = await Promise.all(translationPromises);

    const translatedSummary: RoomSummary = JSON.parse(JSON.stringify(summary)); // Deep copy

    for (const result of results) {
      if (result.index === -1) { // This is the main summary
        translatedSummary.summary.translations = {
          ...translatedSummary.summary.translations,
          ...result.translations,
        };
      } else { // This is an action item
        translatedSummary.actionItems[result.index].task.translations = {
          ...translatedSummary.actionItems[result.index].task.translations,
          ...result.translations,
        };
      }
    }
    
    return translatedSummary;
  }
);


// --- Main Exported Function ---

export async function translateSummary(input: TranslateSummaryInput): Promise<TranslateSummaryOutput> {
  const { summary, targetLanguages, roomId, userId } = input;
  const settings = await getAppSettingsAction();
  const costPerLanguage = settings.summaryTranslationCost || 10;
  
  // Calculate cost for only the languages that are not already translated
  const newLanguagesToTranslate = targetLanguages.filter(lang => !summary.summary.translations?.[lang]);
  if (newLanguagesToTranslate.length === 0) {
    return summary as TranslateSummaryOutput; // No new translations needed
  }
  
  const totalCost = newLanguagesToTranslate.length * costPerLanguage;

  const userRef = doc(db, 'users', userId);
  const userDoc = await userRef.get();
  const userBalance = userDoc.data()?.tokenBalance || 0;

  if (userBalance < totalCost) {
    throw new Error(`Insufficient tokens. You need ${totalCost} tokens to perform this translation.`);
  }

  // Deduct tokens and perform translation in a single flow
  const translatedResult = await translateSummaryFlow(input);
  
  const batch = db.batch();
  
  // 1. Update user balance
  if (totalCost > 0) {
    batch.update(userRef, { tokenBalance: FieldValue.increment(-totalCost) });
    
    // 2. Log transaction
    const logRef = userRef.collection('transactionLogs').doc();
    batch.set(logRef, {
        actionType: 'translation_spend',
        tokenChange: -totalCost,
        timestamp: FieldValue.serverTimestamp(),
        description: `Translated meeting summary into ${newLanguagesToTranslate.length} language(s).`,
    });
  }

  // 3. Save the newly translated summary back to the database
  batch.update(db.collection('syncRooms').doc(roomId), {
    summary: translatedResult
  });
  
  await batch.commit();

  return translatedResult;
}
