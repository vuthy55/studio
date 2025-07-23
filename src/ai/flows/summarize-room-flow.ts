
'use server';
/**
 * @fileOverview A Genkit flow to summarize a Sync Online meeting room.
 *
 * - summarizeRoom - A function that handles the room summarization process.
 * - SummarizeRoomInput - The input type for the summarizeRoom function.
 * - SummarizeRoomOutput - The return type for the summarizeRoom function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { RoomMessage, Participant } from '@/lib/types';


// --- Zod Schemas for Input/Output ---

const SummarizeRoomInputSchema = z.object({
  roomId: z.string().describe('The ID of the sync room to summarize.'),
});
export type SummarizeRoomInput = z.infer<typeof SummarizeRoomInputSchema>;


const SummarizeRoomOutputSchema = z.object({
  title: z.string().describe('A short, descriptive title for the meeting summary.'),
  date: z.string().describe('The date of the meeting in YYYY-MM-DD format.'),
  presentParticipants: z.array(z.string()).describe('List of names of participants who were present.'),
  absentParticipants: z.array(z.string()).describe('List of emails of participants who were invited but absent.'),
  summary: z.string().describe('A detailed, multi-paragraph summary of the meeting discussion.'),
  actionItems: z.array(z.object({
    task: z.string().describe('A specific action item or task identified during the meeting.'),
    personInCharge: z.string().optional().describe('The person or group responsible for the task.'),
    dueDate: z.string().optional().describe('The due date for the task, if mentioned.'),
  })).describe('A list of action items from the meeting.'),
});
export type SummarizeRoomOutput = z.infer<typeof SummarizeRoomOutputSchema>;


// --- Main Exported Function ---

/**
 * Main exported function that wraps and calls the Genkit flow.
 */
export async function summarizeRoom(input: SummarizeRoomInput): Promise<SummarizeRoomOutput> {
  const result = await summarizeRoomFlow(input);

  if (!result) {
    throw new Error('The summarization flow did not return a result.');
  }
  
  // Save the summary to Firestore and close the room
  const roomRef = db.collection('syncRooms').doc(input.roomId);
  await roomRef.update({
    summary: result,
    status: 'closed',
    lastActivityAt: FieldValue.serverTimestamp(),
  });

  return result;
}


// --- Genkit Prompt Definition ---

const summarizeRoomPrompt = ai.definePrompt({
  name: 'summarizeRoomPrompt',
  input: {
    schema: z.object({
      transcript: z.string(),
      presentParticipantNames: z.array(z.string()),
      absentParticipantEmails: z.array(z.string()),
    }),
  },
  output: {
    schema: SummarizeRoomOutputSchema,
  },
  prompt: `You are a professional meeting assistant. Your task is to analyze the provided meeting transcript and create a concise, structured summary.

CONTEXT:
- The meeting was held on {{currentDate}}.
- Participants present: {{{presentParticipantNames}}}.
- Participants absent: {{{absentParticipantEmails}}}.

TRANSCRIPT:
{{{transcript}}}

INSTRUCTIONS:
Based on the transcript and context, generate the following:
1.  **Title**: A brief, descriptive title for the meeting.
2.  **Summary**: A detailed, multi-paragraph summary covering the key discussion points, decisions made, and overall outcomes.
3.  **Action Items**: A list of clear, actionable tasks. For each task, identify the person in charge and any mentioned due dates.

Ensure the output is in the requested JSON format.
`,
});


// --- Genkit Flow Definition ---

const summarizeRoomFlow = ai.defineFlow(
  {
    name: 'summarizeRoomFlow',
    inputSchema: SummarizeRoomInputSchema,
    outputSchema: SummarizeRoomOutputSchema,
  },
  async ({ roomId }) => {
    // 1. Fetch all required data from Firestore
    const roomRef = db.collection('syncRooms').doc(roomId);
    const messagesRef = roomRef.collection('messages').orderBy('createdAt');
    const participantsRef = roomRef.collection('participants');

    const [roomSnap, messagesSnap, participantsSnap] = await Promise.all([
      roomRef.get(),
      messagesRef.get(),
      participantsRef.get(),
    ]);

    if (!roomSnap.exists) {
      throw new Error(`Room with ID ${roomId} not found.`);
    }

    const roomData = roomSnap.data()!;
    const messages = messagesSnap.docs.map(doc => doc.data() as RoomMessage);
    const presentParticipants = participantsSnap.docs.map(doc => doc.data() as Participant);

    // 2. Prepare data for the prompt
    const transcript = messages.map(msg => `${msg.speakerName}: ${msg.text}`).join('\n');
    const presentParticipantNames = presentParticipants.map(p => p.name);
    const presentParticipantEmails = new Set(presentParticipants.map(p => p.email));
    const absentParticipantEmails = roomData.invitedEmails.filter((email: string) => !presentParticipantEmails.has(email));
    
    // 3. Generate the summary using the AI prompt
    const promptData = {
      transcript,
      presentParticipantNames,
      absentParticipantEmails,
    };
    const promptConfig = {
      custom: { currentDate: new Date().toISOString().split('T')[0] }
    };

    let output;
    try {
      // First attempt with the primary model
      const primaryResult = await summarizeRoomPrompt(promptData, {
        ...promptConfig,
        model: 'googleai/gemini-1.5-flash-latest'
      });
      output = primaryResult.output;
    } catch (error: any) {
      if (error.message && (error.message.includes('503') || /overloaded/i.test(error.message))) {
        console.warn('SummarizeRoomFlow: Primary model overloaded, switching to fallback.');
        const fallbackResult = await summarizeRoomPrompt(promptData, {
           ...promptConfig,
           model: 'googleai/gemini-2.0-flash'
        });
        output = fallbackResult.output;
      } else {
        throw error;
      }
    }

    if (!output) {
      throw new Error("Failed to generate a summary from the AI model.");
    }
    
    return output;
  }
);
