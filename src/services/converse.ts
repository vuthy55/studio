'use server';

import { ai } from '@/ai/genkit';

type HistoryItem = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export interface ConverseInput {
  history: HistoryItem[];
  language: string;
  userMessage: string;
}

export interface ConverseOutput {
  reply: string;
}

export async function converse(input: ConverseInput): Promise<ConverseOutput> {
  const { history, language, userMessage } = input;

  const systemInstruction = `You are a friendly and patient language tutor. Your role is to have a simple, encouraging conversation with a user who is learning ${language}. Keep your replies short, simple, and directly related to the user's message. Ask open-ended questions to encourage the user to keep talking. Do not correct their grammar unless they make a very significant error. The goal is to build confidence. Your reply should only be the text of your response.`;

  try {
    const response = await ai.generate({
      model: 'googleai/gemini-1.0-pro',
      system: systemInstruction,
      history: history,
      prompt: userMessage,
    });

    const reply = response.text;
    return { reply };
  } catch (error) {
    console.error('Error calling converse API:', error);
    throw new Error('Failed to get a response from the AI.');
  }
}
