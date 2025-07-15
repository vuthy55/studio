'use server';
/**
 * @fileOverview A flow for generating conversational AI responses.
 *
 * - converse - A function that handles generating a reply in a conversation.
 * - ConverseInput - The input type for the converse function.
 * - ConverseOutput - The return type for the converse function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const ConverseInputSchema = z.object({
  history: z.array(MessageSchema).describe('The conversation history.'),
  language: z.string().describe('The language the user is speaking.'),
  userMessage: z.string().describe('The latest message from the user.'),
});
export type ConverseInput = z.infer<typeof ConverseInputSchema>;

const ConverseOutputSchema = z.object({
  reply: z.string().describe('The AI-generated reply.'),
});
export type ConverseOutput = z.infer<typeof ConverseOutputSchema>;

export async function converse(input: ConverseInput): Promise<ConverseOutput> {
  return converseFlow(input);
}

const prompt = ai.definePrompt({
  name: 'conversePrompt',
  input: { schema: ConverseInputSchema },
  output: { schema: ConverseOutputSchema },
  prompt: `You are a friendly and patient language tutor. Your role is to have a simple, encouraging conversation with a user who is learning {{language}}.

Keep your replies short, simple, and directly related to the user's message. Ask open-ended questions to encourage the user to keep talking. Do not correct their grammar unless they make a very significant error. The goal is to build confidence.

Conversation History:
{{#each history}}
{{#if (eq role 'user')}}User: {{content}}{{/if}}
{{#if (eq role 'model')}}Tutor: {{content}}{{/if}}
{{/each}}

User's latest message: "{{userMessage}}"

Your reply should only be the text of your response.
`,
});

const converseFlow = ai.defineFlow(
  {
    name: 'converseFlow',
    inputSchema: ConverseInputSchema,
    outputSchema: ConverseOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
