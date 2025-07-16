
'use server';
/**
 * @fileOverview A service for translating text from one language to another using the Google Gemini API.
 *
 * - translateText - A function that handles the text translation.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translateText function.
 */
import { z } from 'zod';
import axios from 'axios';

const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  fromLanguage: z.string().describe('The source language of the text.'),
  toLanguage: z.string().describe('The target language for the translation.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;


const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;


export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {

  if (!API_KEY) {
    throw new Error('Missing GEMINI_API_KEY environment variable.');
  }

  const prompt = `Translate the following text from ${input.fromLanguage} to ${input.toLanguage}.
Only return the translated text in a JSON object with a single key "translatedText". Do not include any other explanations, text, or markdown.

Text to translate: "${input.text}"
`;

  try {
    const response = await axios.post(API_URL, {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        "generationConfig": {
            "response_mime_type": "application/json",
        }
    });

    const responseData = JSON.parse(response.data.candidates[0].content.parts[0].text);
    const validationResult = TranslateTextOutputSchema.safeParse(responseData);
        
    if (!validationResult.success) {
        console.error("Gemini API translation response validation error:", validationResult.error);
        throw new Error("Invalid response format from translation service.");
    }
    
    return validationResult.data;

  } catch (error: any) {
    console.error('Error calling Gemini API for translation:', error.response?.data || error.message);
    throw new Error('Failed to translate text.');
  }
}
