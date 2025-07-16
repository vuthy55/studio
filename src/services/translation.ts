'use server';

import axios from 'axios';

const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

export interface TranslateTextInput {
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export interface TranslateTextOutput {
  translatedText: string;
}

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  const { text, fromLanguage, toLanguage } = input;

  const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${fromLanguage} to ${toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation. Text to translate: "${text}"`;

  try {
    const { data } = await axios.post(
      API_URL,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE',
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text.trim();

    if (!translatedText) {
      console.error('Gemini API returned an empty or invalid response.');
      throw new Error('Failed to parse translation from API response.');
    }

    return { translatedText };
  } catch (error: any) {
    console.error(
      'Error calling Gemini API for translation:',
      error.response?.data || error.message
    );
    throw new Error('Failed to translate text.');
  }
}
