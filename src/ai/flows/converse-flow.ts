
'use server';

import { ai } from '@/ai/genkit';
import { ConverseInputSchema, ConverseOutputSchema, type ConverseInput, type ConverseOutput } from './types';


const converseFlow = ai.defineFlow(
  {
    name: 'converseFlow',
    inputSchema: ConverseInputSchema,
    outputSchema: ConverseOutputSchema,
  },
  async (input) => {
    const { history, language, userMessage } = input;

    const systemInstruction = `You are a friendly and patient language tutor. Your role is to have a simple, encouraging conversation with a user who is learning ${language}. Keep your replies short, simple, and directly related to the user's message. Ask open-ended questions to encourage the user to keep talking. Do not correct their grammar unless they make a very significant error. The goal is to build confidence. Your reply should only be the text of your response.`;

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      system: systemInstruction,
      history: history,
      prompt: userMessage,
    });
    
    return { reply: response.text };
  }
);

export async function converse(input: ConverseInput): Promise<ConverseOutput> {
  return converseFlow(input);
}
