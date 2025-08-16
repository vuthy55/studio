
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

// This file has been refactored to remove the singleton `activeRecognizer` pattern.
// Each function now manages its own recognizer instance, ensuring proper resource
// cleanup and preventing race conditions that were causing authentication failures.

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

// --- Helper Functions ---

function getSpeechConfig(): sdk.SpeechConfig {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured in your .env file.");
    }
    return sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
}


// A placeholder for a function to abort recognition. In this new architecture,
// we don't manage a single global recognizer, so direct abortion is handled
// by the component logic (e.g., unmounting). This function remains for compatibility
// but does not have a function body as we let the SDK manage its lifecycle per-call.
export function abortRecognition() {
    // This function is intentionally left blank.
    // The previous implementation of a global recognizer was causing race conditions.
    // Each function now creates and destroys its own recognizer instance.
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
 * Performs pronunciation assessment using the reliable recognizeOnceAsync method.
 * This version uses a robust promise wrapper to ensure the recognizer is closed correctly.
 * @param referenceText The text to compare against.
 * @param lang The language of the text.
 * @returns {Promise<PronunciationAssessmentResult>}
 */
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error(`[SPEECH] Unsupported language for assessment: ${lang}`);
    
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    speechConfig.speechRecognitionLanguage = locale;
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(recognizer);

    return new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            try {
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
                    if (cancellation.reason === sdk.CancellationReason.Error) {
                        reject(new Error(`Recognition failed: ${cancellation.errorDetails}`));
                    } else {
                        reject(new Error("Recognition was aborted."));
                    }
                }
            } catch (e) {
                reject(e);
            } finally {
                // IMPORTANT: Close the recognizer inside the callback to release resources
                // only after the final result has been processed.
                recognizer.close();
            }
        }, err => {
            try {
                reject(new Error(`Recognition error: ${err}`));
            } finally {
                recognizer.close();
            }
        });
    });
}


/**
 * Recognizes speech from the microphone for a single language.
 * @param fromLanguage The language to recognize.
 * @returns A promise that resolves with the recognized text.
 */
export async function recognizeFromMic(fromLanguage: AzureLanguageCode): Promise<string> {
    if (!fromLanguage) throw new Error("A valid language code must be provided for recognition.");
    
    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = fromLanguage;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise<string>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            try {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    resolve(result.text);
                } else if (result.reason === sdk.ResultReason.NoMatch) {
                    resolve(''); // Resolve with empty string if no match
                } else if (result.reason === sdk.ResultReason.Canceled) {
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    if (cancellation.reason === sdk.CancellationReason.Error) {
                         let errorMessage = `Recognition canceled: ${cancellation.errorDetails}`;
                        if (cancellation.ErrorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
                            errorMessage = "Recognition failed due to an authentication error. Please check your Azure credentials and microphone permissions.";
                        }
                        reject(new Error(errorMessage));
                    } else {
                        reject(new Error("Recognition was aborted."));
                    }
                } else {
                    reject(new Error(`Could not recognize speech. Reason: ${result.reason}`));
                }
            } finally {
                recognizer.close();
            }
        }, err => {
            try {
                reject(new Error(`Recognition error: ${err}`));
            } finally {
                recognizer.close();
            }
        });
    });
}


/**
 * Recognizes speech with auto-detection from a list of languages.
 * @param languages An array of language codes to detect from.
 * @returns A promise resolving to the detected language and text.
 */
export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    
    return new Promise<{ detectedLang: string, text: string }>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            try {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                    resolve({
                        detectedLang: autoDetectResult.language,
                        text: result.text
                    });
                } else if (result.reason === sdk.ResultReason.Canceled) {
                     const cancellation = sdk.CancellationDetails.fromResult(result);
                     if (cancellation.reason === sdk.CancellationReason.Error) {
                        reject(new Error(`Auto-detect canceled: ${cancellation.errorDetails}`));
                    } else {
                         reject(new Error("Recognition was aborted."));
                    }
                } else {
                    reject(new Error("No recognized speech"));
                }
            } finally {
                recognizer.close();
            }
        }, err => {
            try {
                reject(new Error(`Auto-detect recognition error: ${err}`));
            } finally {
                recognizer.close();
            }
        });
    });
}
