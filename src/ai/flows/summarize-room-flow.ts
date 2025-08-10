
'use server';
/**
 * @fileOverview A Genkit flow to summarize a Sync Online meeting room.
 *
 * - summarizeRoom - A function that handles the room summarization process.
 * - SummarizeRoomInput - The input type for the summarizeRoom function.
 * - SummarizeRoomOutput - The return type for the summarizeRoom function.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { RoomMessage, Participant, RoomSummary, Transcript } from '@/lib/types';


// --- Zod Schemas for Input/Output ---

const SummarizeRoomInputSchema = z.object({
  roomId: z.string().describe('The ID of the sync room to summarize.'),
});
export type SummarizeRoomInput = z.infer<typeof SummarizeRoomInputSchema>;


const ParticipantSchema = z.object({
    name: z.string().describe("The participant's display name."),
    email: z.string().describe("The participant's email address."),
    language: z.string().describe("The participant's chosen language for the meeting (e.g., 'English (United States)', 'Thai (Thailand)').")
});

const TranslatedContentSchema = z.object({
    original: z.string(),
    translations: z.record(z.string()).optional(),
});

// This schema defines the expected output from the AI.
const AISummaryOutputSchema = z.object({
  title: z.string().describe('A short, descriptive title for the meeting summary.'),
  date: z.string().describe('The date of the meeting in YYYY-MM-DD format.'),
  presentParticipants: z.array(ParticipantSchema).describe('List of participants who were present.'),
  absentParticipants: z.array(ParticipantSchema).describe('List of participants who were invited but absent.'),
  summary: TranslatedContentSchema,
  actionItems: z.array(z.object({
    task: TranslatedContentSchema,
    personInCharge: z.string().optional().describe('The person or group responsible for the task.'),
    dueDate: z.string().optional().describe('The due date for the task, if mentioned.'),
  })).describe('A list of action items from the meeting.'),
});

// This is the final type that will be returned by the flow.
export type SummarizeRoomOutput = z.infer<typeof AISummaryOutputSchema>;


// --- Main Exported Function ---

/**
 * Main exported function that wraps and calls the Genkit flow.
 * This function is now responsible ONLY for generating the summary data,
 * not for saving it.
 */
export async function summarizeRoom(input: SummarizeRoomInput): Promise<SummarizeRoomOutput> {
  const result = await summarizeRoomFlow(input);
  return result;
}

const generateWithFallback = async (prompt: string, context: any, outputSchema: any) => {
    try {
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-flash',
            output: { schema: outputSchema },
            context,
        });
        return output;
    } catch (error) {
        console.warn("Primary summary model (gemini-1.5-flash) failed. Retrying with fallback.", error);
        const { output } = await ai.generate({
            prompt,
            model: 'googleai/gemini-1.5-pro',
            output: { schema: outputSchema },
            context,
        });
        return output;
    }
};


// --- Genkit Flow and Prompt Definitions ---

const summarizeRoomFlow = ai.defineFlow(
  {
    name: 'summarizeRoomFlow',
    inputSchema: SummarizeRoomInputSchema,
    outputSchema: AISummaryOutputSchema,
  },
  async ({ roomId }) => {
    // 1. Fetch data from Firestore
    const roomRef = db.collection('syncRooms').doc(roomId);
    const messagesRef = roomRef.collection('messages').orderBy('createdAt');
    const participantsRef = roomRef.collection('participants');
    
    const [roomSnap, messagesSnap, participantsHistorySnap] = await Promise.all([
      roomRef.get(),
      messagesRef.get(),
      participantsRef.get(),
    ]);

    if (!roomSnap.exists) {
      throw new Error(`Room with ID ${roomId} not found.`);
    }

    const roomData = roomSnap.data();
    const messages = messagesSnap.docs.map(doc => doc.data() as RoomMessage);
    const participantHistory = participantsHistorySnap.docs.map(doc => doc.data() as Participant);
    
    const presentParticipantEmails = new Set(participantHistory.map(p => p.email));
    
    const allInvitedUsers = (roomData?.invitedEmails || []).map((email: string) => {
        const participantDetail = participantHistory.find(p => p.email === email);
        return {
            name: participantDetail?.name || email.split('@')[0],
            email,
            language: participantDetail?.selectedLanguage || 'Not specified'
        };
    });
    
    const presentParticipants = allInvitedUsers.filter(p => presentParticipantEmails.has(p.email));
    const absentParticipants = allInvitedUsers.filter(p => !presentParticipantEmails.has(p.email));

    const chatHistory = messages
      .map(msg => `${msg.speakerName}: ${msg.text}`)
      .join('\n');

    // 2. Define the prompt payload
    const promptPayload = {
      title: roomData?.topic || 'Meeting Summary',
      date: (roomData?.createdAt as Timestamp).toDate().toISOString().split('T')[0],
      chatHistory,
      presentParticipants,
      absentParticipants,
    };
    
    // 3. Call the AI model
    const output = await generateWithFallback(
      `You are an expert meeting summarizer. Based on the provided chat history and participant list, generate a concise summary and a list of clear action items.

      Meeting Title: {{{title}}}
      Date: {{{date}}}
      
      Participants Present:
      {{#each presentParticipants}}
      - {{name}} ({{email}})
      {{/each}}

      Participants Absent:
      {{#each absentParticipants}}
      - {{name}} ({{email}})
      {{/each}}
      
      Chat History:
      ---
      {{{chatHistory}}}
      ---

      Based on the chat history, provide a neutral, one-paragraph summary of the meeting. Then, list any concrete action items, specifying the task, the person in charge, and the due date if mentioned.
      `,
      promptPayload,
      AISummaryOutputSchema
    );
    
    return output!;
  }
);
