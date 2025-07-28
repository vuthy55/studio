
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

// --- Singleton Manager for the active recognizer ---
let activeRecognizer: sdk.SpeechRecognizer | null = null;

function getSpeechConfig(): sdk.SpeechConfig {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured in your .env file.");
    }
    return sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
}

// --- Public API ---

export type PronunciationAssessmentResult = {
  accuracy: number;
  fluency: number;
  completeness: number;
  pronScore: number;
  isPass: boolean;
};

/**
 * Aborts any ongoing recognition. This is a crucial cleanup function.
 */
export function abortRecognition() {
    if (activeRecognizer) {
        try {
            activeRecognizer.close();
        } catch (e) {
            // Errors are expected if the recognizer is already closing.
        } finally {
            activeRecognizer = null;
        }
    }
}


/**
 * Performs pronunciation assessment using the reliable recognizeOnceAsync method.
 * @param referenceText The text to compare against.
 * @param lang The language of the text.
 * @returns {Promise<PronunciationAssessmentResult>}
 */
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error(`[SPEECH] Unsupported language for assessment: ${lang}`);
    
    abortRecognition();
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    
    speechConfig.speechRecognitionLanguage = locale;
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    activeRecognizer = recognizer;

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );

    pronunciationConfig.applyTo(recognizer);

    return new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
                 reject(new Error("Could not recognize speech. Please try again."));
            } else if (result.reason === sdk.ResultReason.Canceled) {
                 const cancellation = sdk.CancellationDetails.fromResult(result);
                 reject(new Error(`Recognition failed: ${cancellation.errorDetails}`));
            }
        }, err => {
            reject(new Error(`Recognition error: ${err}`));
        });
    });
}


export async function recognizeFromMic(fromLanguage: AzureLanguageCode): Promise<string> {
    if (!fromLanguage) throw new Error("A valid language code must be provided for recognition.");
    
    abortRecognition();
    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = fromLanguage;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    activeRecognizer = recognizer;

    return new Promise<string>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else if (result.reason === sdk.ResultReason.NoMatch) {
                resolve('');
            } else if (result.reason === sdk.ResultReason.Canceled) {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                let errorMessage = `Recognition canceled: ${cancellation.errorDetails}`;
                if (cancellation.errorCode === sdk.CancellationErrorCode.PermissionDenied) {
                    errorMessage = "Recognition failed: Microphone permissions may not be granted.";
                }
                reject(new Error(errorMessage));
            } else {
                reject(new Error(`Could not recognize speech. Reason: ${result.reason}`));
            }
        }, err => {
            reject(new Error(`Recognition error: ${err}`));
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    abortRecognition();
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    
    activeRecognizer = recognizer;
    
    return new Promise((resolve, reject) => {
         recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                reject(new Error("No recognized speech"));
            }
        }, err => {
            reject(new Error(`Auto-detect recognition error: ${err}`));
        });
    });
}

export function getContinuousRecognizerForRoom(
    language: string,
    recognizedCallback: (text: string) => void,
    errorCallback: (errorDetails: string) => void,
    stoppedCallback: () => void
): sdk.SpeechRecognizer {
    abortRecognition(); // Ensure no other recognizer is active
    
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    speechConfig.speechRecognitionLanguage = language;
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    activeRecognizer = recognizer; // Keep track of the active recognizer

    recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            recognizedCallback(e.result.text);
        }
    };

    recognizer.canceled = (s, e) => {
        if (e.reason === sdk.CancellationReason.Error) {
            errorCallback(e.errorDetails || 'Unknown cancellation error');
        }
        stoppedCallback();
    };

    recognizer.sessionStopped = (s, e) => {
        stoppedCallback();
    };
    
    return recognizer;
}
