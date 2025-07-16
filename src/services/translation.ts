'use server';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

export interface TranslateTextInput {
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export interface TranslateTextOutput {
  translatedText: string;
}

export async function translateText(input: TranslateTextInput): Promise<TranslateTextOutput> {
  const { text, fromLanguage, toLanguage } = input;

  const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${fromLanguage} to ${toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation. Text to translate: "${text}"`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
            // Ensure we get a deterministic response for translation
            temperature: 0,
        }
      }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Translate API Error:", response.status, errorBody);
        throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || 'Translation failed.';

    return { translatedText };

  } catch (error) {
    console.error('Error calling translation API:', error);
    throw new Error('Failed to translate text.');
  }
}
