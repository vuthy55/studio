'use server';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

type MessagePart = { text: string };
type HistoryItem = { role: 'user' | 'model'; parts: MessagePart[] };

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

  const systemInstruction = {
    role: "system",
    parts: [{ text: `You are a friendly and patient language tutor. Your role is to have a simple, encouraging conversation with a user who is learning ${language}. Keep your replies short, simple, and directly related to the user's message. Ask open-ended questions to encourage the user to keep talking. Do not correct their grammar unless they make a very significant error. The goal is to build confidence. Your reply should only be the text of your response.`}]
  };
  
  const contents = [
    systemInstruction,
    ...history, 
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Converse API Error:", response.status, errorBody);
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    
    return { reply };

  } catch (error) {
    console.error('Error calling converse API:', error);
    throw new Error('Failed to get a response from the AI.');
  }
}
