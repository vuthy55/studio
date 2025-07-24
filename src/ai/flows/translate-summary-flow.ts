
'use server';
/**
 * @fileOverview A Genkit flow to translate a meeting summary.
 *
 * This flow takes an existing summary object and a list of target languages,
 * and returns the summary object with translations added for the summary
 * text and each action item.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { RoomSummary } from '@/lib/types';
import { db } from '@/lib/firebase-admin';
import { getAppSettingsAction } from '@/actions/settings';
import { FieldValue } from 'firebase-admin/firestore';

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


// --- Main Exported Function ---

export async function translateSummary(input: TranslateSummaryInput): Promise<TranslateSummaryOutput> {
  const result = await translateSummaryFlow(input);
  if (!result) {
    throw new Error('The translation flow did not return a result.');
  }
  return result;
}


// --- Genkit Prompt Definition ---

const TranslationOutputSchema = z.object({
    summaryTranslation: z.string().describe("The translation of the main summary text."),
    actionItemTranslations: z.array(z.string()).describe("An array of translations for each action item, in the same order as they were provided."),
});

const translateSummaryPrompt = ai.definePrompt({
  name: 'translateSummaryPrompt',
  input: {
    schema: z.object({
      language: z.string(),
      summaryText: z.string(),
      actionItemTexts: z.array(z.string()),
    }),
  },
  output: {
    schema: TranslationOutputSchema,
  },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `You are an expert translator. Your task is to translate the provided meeting summary and its action items into the specified language: {{language}}.

Provide only the direct translations in the requested JSON format. Do not add any extra commentary.

MEETING SUMMARY:
{{{summaryText}}}

ACTION ITEMS:
{{#each actionItemTexts}}
- {{{this}}}
{{/each}}
`,
    config: {
        temperature: 0.1,
    }
});


// --- Genkit Flow Definition ---

const translateSummaryFlow = ai.defineFlow(
  {
    name: 'translateSummaryFlow',
    inputSchema: TranslateSummaryInputSchema,
    outputSchema: RoomSummarySchemaForOutput,
  },
  async ({ summary, targetLanguages, roomId, userId }) => {
    
    const settings = await getAppSettingsAction();
    const userRef = db.collection('users').doc(userId);
    const roomRef = db.collection('syncRooms').doc(roomId);

    // Filter out languages that are already translated
    const languagesToTranslate = targetLanguages.filter(lang => !summary.summary.translations?.[lang]);
    
    if (languagesToTranslate.length === 0) {
        console.log("No new languages to translate. Returning original summary.");
        return summary;
    }

    const totalCost = languagesToTranslate.length * (settings.summaryTranslationCost || 10);
    
    // Create a mutable copy of the summary to update
    const updatedSummary: RoomSummary = JSON.parse(JSON.stringify(summary));

    for (const lang of languagesToTranslate) {
        const promptData = {
            language: lang,
            summaryText: updatedSummary.summary.original,
            actionItemTexts: updatedSummary.actionItems.map((item: any) => item.task.original),
        };

        const { output } = await translateSummaryPrompt(promptData);

        if (!output) {
            console.warn(`Translation failed for language: ${lang}`);
            continue; // Skip this language and try the next one
        }
        
        if (!updatedSummary.summary.translations) {
            updatedSummary.summary.translations = {};
        }
        updatedSummary.summary.translations[lang] = output.summaryTranslation;

        updatedSummary.actionItems.forEach((item: any, index: number) => {
            if (output.actionItemTranslations[index]) {
                if (!item.task.translations) {
                    item.task.translations = {};
                }
                item.task.translations[lang] = output.actionItemTranslations[index];
            }
        });
    }

    // Now, run a transaction to charge the user and update the room
    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("User not found");

        const currentBalance = userDoc.data()?.tokenBalance || 0;
        if (currentBalance < totalCost) {
            throw new Error("Insufficient tokens for this translation.");
        }

        // 1. Update the room with the newly translated summary
        transaction.update(roomRef, { summary: updatedSummary });

        // 2. Deduct tokens from the user
        transaction.update(userRef, { tokenBalance: FieldValue.increment(-totalCost) });

        // 3. Add a transaction log
        const logRef = userRef.collection('transactionLogs').doc();
        transaction.set(logRef, {
            actionType: 'translation_spend',
            tokenChange: -totalCost,
            timestamp: FieldValue.serverTimestamp(),
            description: `Translated summary for room "${summary.title}" into ${languagesToTranslate.length} language(s).`
        });
    });


    return updatedSummary;
  }
);
