
'use server';
/**
 * @fileOverview A Genkit flow to translate a meeting summary.
 *
 * This flow takes an existing summary object and a list of target languages,
 * and returns the summary object with translations added for the summary
 * text and each action item.
 */

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


// --- Main Exported Function ---

export async function translateSummary(input: TranslateSummaryInput): Promise<TranslateSummaryOutput> {
  // Since Genkit is removed, this function is a placeholder and would need to be reimplemented
  // with a different AI service or library.
  // For now, it will throw an error if called.
  throw new Error('Genkit functionality has been removed due to build conflicts. This feature is disabled.');
}
