
'use server';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`;

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

  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
  }

  const prompt = `You are a direct translation assistant. Your only task is to translate the user's text from ${fromLanguage} to ${toLanguage}. Do not add any extra information, context, or phonetic guides. Only provide the direct translation. Text to translate: "${text}"`;

  try {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': API_KEY,
        },
        body: JSON.stringify({
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
                temperature: 0.1,
                topP: 1,
                topK: 1,
            },
        }),
    });
    
    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", response.status, errorBody);
        throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Check for empty or invalid response from the API
    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0] ||
      !data.candidates[0].content.parts[0].text
    ) {
      console.error('Gemini API returned an empty or invalid response.', data);
      throw new Error('Failed to parse translation from API response.');
    }
    
    const translatedText = data.candidates[0].content.parts[0].text.trim();

    return { translatedText };
  } catch (error: any) {
    console.error(
      'Error calling Gemini API for translation:',
      error.message
    );
    throw new Error('Failed to translate text.');
  }
}
