
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
import type { RoomMessage, Participant, RoomSummary } from '@/lib/types';


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

// This is the final type that will be saved to Firestore, including the translation structure.
export type SummarizeRoomOutput = RoomSummary;


// --- Main Exported Function ---

/**
 * Main exported function that wraps and calls the Genkit flow.
 */
export async function summarizeRoom(input: SummarizeRoomInput): Promise<RoomSummary> {
  const result = await summarizeRoomFlow(input);

  if (!result) {
    throw new Error('The summarization flow did not return a result.');
  }
  
  // Adapt the AI output to the RoomSummary structure for Firestore
  const finalSummary: RoomSummary = {
    // Directly use the participant lists from the AI output
    ...result,
    summary: {
      original: result.summary.original,
      translations: {},
    },
    actionItems: result.actionItems.map(item => ({
      ...item,
      task: {
        original: item.task.original,
        translations: {},
      }
    }))
  };

  // Save the summary to Firestore and close the room
  const roomRef = db.collection('syncRooms').doc(input.roomId);
  await roomRef.update({
    summary: finalSummary,
    status: 'closed',
    lastActivityAt: FieldValue.serverTimestamp(),
  });

  return finalSummary;
}


// --- Genkit Prompt Definition ---

const summarizeRoomPrompt = ai.definePrompt({
  name: 'summarizeRoomPrompt',
  input: {
    schema: z.object({
      transcript: z.string(),
      meetingDate: z.string(),
      allInvitedUsers: z.array(ParticipantSchema),
      presentParticipantEmails: z.array(z.string()),
    }),
  },
  output: {
    schema: AISummaryOutputSchema,
  },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `You are a professional meeting assistant. Your task is to analyze the provided meeting transcript and create a concise, structured summary.

CONTEXT:
- The meeting was held on {{meetingDate}}.
- The complete list of ALL invited individuals, along with their selected language for this meeting, is: {{#each allInvitedUsers}}{{this.name}} ({{this.email}}), language: {{this.language}}{{#unless @last}}; {{/unless}}{{/each}}.
- The emails of users who were PRESENT in the room (determined by who spoke) are: {{#each presentParticipantEmails}}{{@key}}{{#unless @last}}, {{/unless}}{{/each}}.
- From this information, you must determine who was present and who was absent and populate the output fields accordingly. Use the language provided in the 'all invited individuals' list for each person.

TRANSCRIPT (This may be empty if no one spoke):
{{{transcript}}}

INSTRUCTIONS:
Based on the provided context and transcript, generate the following:
1.  **Title**: A brief, descriptive title for the meeting.
2.  **Date**: The date of the meeting in YYYY-MM-DD format.
3.  **Present Participants**: An array of objects for each person who attended.
4.  **Absent Participants**: An array of objects for each person who was invited but did not attend.
5.  **Summary**: A detailed, multi-paragraph summary covering the key discussion points, decisions made, and overall outcomes. If the transcript is empty, state that the meeting occurred but no discussion was recorded.
6.  **Action Items**: A list of clear, actionable tasks. If none, return an empty array.

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
    outputSchema: AISummaryOutputSchema,
  },
  async ({ roomId }) => {
    // 1. Fetch all required data from Firestore
    const roomRef = db.collection('syncRooms').doc(roomId);
    const messagesRef = roomRef.collection('messages').orderBy('createdAt');
    const participantsRef = roomRef.collection('participants');

    const [roomSnap, messagesSnap, participantsHistorySnap] = await Promise.all([
      roomRef.get(),
      messagesRef.get(),
      participantsRef.get(), // This gets the full history of participants who ever joined
    ]);

    if (!roomSnap.exists) {
      throw new Error(`Room with ID ${roomId} not found.`);
    }

    // 2. Prepare data for the prompt
    const roomData = roomSnap.data()!;
    const messages = messagesSnap.docs.map(doc => doc.data() as RoomMessage);
    const participantHistory = participantsHistorySnap.docs.map(doc => doc.data() as Participant);
    
    // Determine who was present by checking who sent messages.
    // This is more reliable than the real-time participants collection.
    const speakerUids = new Set(messages.map(msg => msg.speakerUid));
    const presentParticipantsFromHistory = participantHistory.filter(p => speakerUids.has(p.uid));
    const presentParticipantEmails = presentParticipantsFromHistory.map(p => p.email);

    // If no one spoke, but people were in the room, consider them present.
    if (presentParticipantEmails.length === 0 && participantHistory.length > 0) {
        participantHistory.forEach(p => presentParticipantEmails.push(p.email));
    }

    const transcript = messages.map(msg => `${msg.speakerName}: ${msg.text}`).join('\n');
    
    const allInvitedUsers: { name: string; email: string, language: string }[] = [];
    if (roomData.invitedEmails && roomData.invitedEmails.length > 0) {
        const usersRef = db.collection('users');
        const invitedUsersQuery = usersRef.where('email', 'in', roomData.invitedEmails);
        const invitedUsersSnap = await invitedUsersQuery.get();
        const userDocsByEmail = new Map(invitedUsersSnap.docs.map(d => [d.data().email, d.data()]));
        
        // This map now contains the chosen language for every participant who was ever present in the room.
        const participantLanguageMap = new Map(participantHistory.map(p => [p.email, p.selectedLanguage]));

        roomData.invitedEmails.forEach((email: string) => {
            const userData = userDocsByEmail.get(email);
            const language = participantLanguageMap.get(email) || 'Not specified'; 
            allInvitedUsers.push({ 
                name: userData?.name || email.split('@')[0], 
                email: email,
                language: language
            });
        });
    }
    
    const meetingDate = (roomData.createdAt as Timestamp).toDate().toISOString().split('T')[0];

    const promptData = {
      transcript,
      meetingDate,
      allInvitedUsers,
      presentParticipantEmails,
    };

    let output;
    try {
      const { output: primaryOutput } = await summarizeRoomPrompt(promptData);
      output = primaryOutput;
    } catch (error: any) {
      if (error.message && (error.message.includes('503') || /overloaded/i.test(error.message))) {
        console.warn('SummarizeRoomFlow: Primary model overloaded, switching to fallback.');
        const { output: fallbackOutput } = await ai.generate({
           model: 'googleai/gemini-1.5-flash-latest',
           prompt: summarizeRoomPrompt.prompt, 
           input: promptData,
           output: { schema: AISummaryOutputSchema }, 
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

    