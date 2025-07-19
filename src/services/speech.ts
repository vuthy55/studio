
'use server';

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

function getSpeechConfig() {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured.");
    }
    return sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
}

/**
 * Performs one-shot speech recognition.
 * @param fromLanguage The language to recognize.
 * @returns The recognized text.
 */
export async function recognizeFromMic(fromLanguage: LanguageCode): Promise<string> {
    const speechConfig = getSpeechConfig();
    const locale = languageToLocaleMap[fromLanguage];
    if (!locale) throw new Error("Unsupported language for recognition.");

    speechConfig.speechRecognitionLanguage = locale;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    try {
        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
            recognizer.recognizeOnceAsync(resolve, reject);
        });

        if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
            return result.text;
        } else {
            throw new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}`);
        }
    } finally {
        recognizer.close();
    }
}


export type PronunciationAssessmentResult = {
  accuracy: number;
  fluency: number;
  completeness: number;
  pronScore: number;
  isPass: boolean;
};

/**
 * Performs pronunciation assessment on a given phrase.
 * @param referenceText The text to compare against.
 * @param lang The language of the text.
 * @returns An object with assessment scores.
 */
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const speechConfig = getSpeechConfig();
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    speechConfig.speechRecognitionLanguage = locale;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true
    );
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationConfig.applyTo(recognizer);
    
    try {
        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
            recognizer.recognizeOnceAsync(resolve, reject);
        });

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
            const accuracyScore = assessment.accuracyScore;
            return {
                accuracy: accuracyScore,
                fluency: assessment.fluencyScore,
                completeness: assessment.completenessScore,
                pronScore: assessment.pronunciationScore,
                isPass: accuracyScore > 70
            };
        } else {
            throw new Error(`Recognition failed: ${sdk.ResultReason[result.reason]}`);
        }
    } finally {
        recognizer.close();
    }
}


/**
 * Performs one-shot speech recognition with auto-detection from a list of languages.
 * @param languages An array of Azure language codes to detect from.
 * @returns An object with the detected language and the recognized text.
 */
export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);

    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);

    try {
        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
            recognizer.recognizeOnceAsync(resolve, reject);
        });

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
            return {
                detectedLang: autoDetectResult.language,
                text: result.text
            };
        } else {
             throw new Error(result.errorDetails || "No speech could be recognized.");
        }
    } finally {
        recognizer.close();
    }
}
