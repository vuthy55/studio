
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


const ParticipantSchema = z.object({
    name: z.string().describe("The participant's display name."),
    email: z.string().describe("The participant's email address."),
});

const SummarizeRoomOutputSchema = z.object({
  title: z.string().describe('A short, descriptive title for the meeting summary.'),
  date: z.string().describe('The date of the meeting in YYYY-MM-DD format.'),
  presentParticipants: z.array(ParticipantSchema).describe('List of participants who were present.'),
  absentParticipants: z.array(ParticipantSchema).describe('List of participants who were invited but absent.'),
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
      meetingDate: z.string(),
      allInvitedUsers: z.array(ParticipantSchema),
      presentParticipantEmails: z.array(z.string().email()),
    }),
  },
  output: {
    schema: SummarizeRoomOutputSchema,
  },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `You are a professional meeting assistant. Your task is to analyze the provided meeting transcript and create a concise, structured summary.

CONTEXT:
- The meeting was held on {{meetingDate}}.
- All invited users are: {{#each allInvitedUsers}}{{this.name}} ({{this.email}}){{#unless @last}}, {{/unless}}{{/each}}.
- The emails of users who were PRESENT are: {{#each presentParticipantEmails}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}.
- From this information, you must determine who was present and who was absent and populate the output fields accordingly.

TRANSCRIPT:
{{{transcript}}}

INSTRUCTIONS:
Based on the transcript and context, generate the following:
1.  **Title**: A brief, descriptive title for the meeting.
2.  **Date**: The date of the meeting in YYYY-MM-DD format.
3.  **Present Participants**: An array of objects for each person who attended, with their name and email.
4.  **Absent Participants**: An array of objects for each person who was invited but did not attend, with their name and email.
5.  **Summary**: A detailed, multi-paragraph summary covering the key discussion points, decisions made, and overall outcomes.
6.  **Action Items**: A list of clear, actionable tasks. For each task, identify the person in charge and any mentioned due dates.

Ensure the output is in the requested JSON format.
`,
    config: {
        temperature: 0.3,
    }
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

    // 2. Prepare data for the prompt
    const roomData = roomSnap.data()!;
    const messages = messagesSnap.docs.map(doc => doc.data() as RoomMessage);
    const presentParticipantDocs = participantsSnap.docs.map(doc => doc.data() as Participant);
    
    const transcript = messages.map(msg => `${msg.speakerName}: ${msg.text}`).join('\n');
    
    const allInvitedUsers: { name: string; email: string }[] = [];
    if (roomData.invitedEmails && roomData.invitedEmails.length > 0) {
        const usersRef = db.collection('users');
        const invitedUsersQuery = usersRef.where('email', 'in', roomData.invitedEmails);
        const invitedUsersSnap = await invitedUsersQuery.get();
        invitedUsersSnap.forEach(doc => {
            const userData = doc.data();
            allInvitedUsers.push({ name: userData.name || userData.email.split('@')[0], email: userData.email });
        });
    }

    const presentParticipantEmails = presentParticipantDocs.map(p => p.email);
    
    const meetingDate = (roomData.createdAt as Timestamp).toDate().toISOString().split('T')[0];

    const promptData = {
      transcript,
      meetingDate,
      allInvitedUsers,
      presentParticipantEmails,
    };

    let output;
    try {
      // Call the prompt function directly
      const { output: primaryOutput } = await summarizeRoomPrompt(promptData);
      output = primaryOutput;
    } catch (error: any) {
      if (error.message && (error.message.includes('503') || /overloaded/i.test(error.message))) {
        console.warn('SummarizeRoomFlow: Primary model overloaded, switching to fallback.');
        const { output: fallbackOutput } = await ai.generate({
           prompt: summarizeRoomPrompt.prompt, // Use the raw prompt string for the generic generate call
           input: promptData,
           output: { schema: SummarizeRoomOutputSchema },
           model: 'googleai/gemini-1.5-flash',
           config: {
                temperature: 0.3
           }
        });
        output = fallbackOutput;
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
