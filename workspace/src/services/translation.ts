
'use server';
/**
 * @fileOverview A service for translating text from one language to another using Azure Cognitive Services.
 *
 * - translateText - A function that handles the text translation.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translateText function.
 */
import { z } from 'zod';
import axios from 'axios';
import { languages, type LanguageCode } from '@/lib/data';

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

const languageNameToCodeMap: Record<string, LanguageCode> = languages.reduce(
  (acc, lang) => {
    acc[lang.label] = lang.value;
    return acc;
  },
  {} as Record<string, LanguageCode>
);

const languageCodeToAzureCode: Partial<Record<LanguageCode, string>> = {
  english: 'en',
  thai: 'th',
  vietnamese: 'vi',
  khmer: 'km',
  filipino: 'fil',
  malay: 'ms',
  indonesian: 'id',
  burmese: 'my',
  laos: 'lo',
  tamil: 'ta',
  chinese: 'zh-Hans',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
};

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  const apiKey = process.env.AZURE_TRANSLATOR_KEY;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!apiKey || !endpoint || !region) {
    throw new Error('Azure Translator environment variables are not set.');
  }

  const fromLangCode = languageNameToCodeMap[input.fromLanguage];
  const toLangCode = languageNameToCodeMap[input.toLanguage];
  
  const azureFromCode = languageCodeToAzureCode[fromLangCode];
  const azureToCode = languageCodeToAzureCode[toLangCode];

  if (!azureToCode) {
    throw new Error(`Unsupported target language: ${input.toLanguage}`);
  }

  try {
    const response = await axios({
        baseURL: endpoint,
        url: '/translate',
        method: 'post',
        headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Ocp-Apim-Subscription-Region': region,
            'Content-type': 'application/json'
        },
        params: {
            'api-version': '3.0',
            'from': azureFromCode,
            'to': azureToCode
        },
        data: [{
            'text': input.text
        }],
        responseType: 'json'
    });

    const result = response.data;
    if (
      result &&
      result.length > 0 &&
      result[0].translations &&
      result[0].translations.length > 0
    ) {
      return { translatedText: result[0].translations[0].text };
    } else {
      throw new Error('Translation failed to return a result.');
    }
  } catch (error: any) {
    console.error('Error calling Azure Translator API:', error.response?.data || error.message);
    throw new Error('Failed to translate text.');
  }
}
