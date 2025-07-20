
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};


// --- Singleton Manager ---

let speechConfig: sdk.SpeechConfig | null = null;
let audioConfig: sdk.AudioConfig | null = null;
let recognizer: sdk.SpeechRecognizer | null = null;

function getSpeechConfig(): sdk.SpeechConfig {
    if (speechConfig) return speechConfig;

    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured in your .env file.");
    }
    speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    return speechConfig;
}

function getAudioConfig(): sdk.AudioConfig {
    if (audioConfig) return audioConfig;

    if (typeof window === 'undefined') {
        throw new Error("Microphone access is only available in the browser.");
    }
    audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    return audioConfig;
}

function getRecognizer(languageOrDetectConfig: string | sdk.AutoDetectSourceLanguageConfig): sdk.SpeechRecognizer {
    // If a recognizer exists, we might need to recreate it if the language config changes.
    // For simplicity and stability, we'll close the old one and create a new one as needed.
    // The key is that the underlying audio/speech configs are singletons.
    if (recognizer) {
        // Stop any active recognition before creating a new one.
        recognizer.stopContinuousRecognitionAsync(() => {}, () => {});
        recognizer.close();
        recognizer = null;
    }
    
    const sc = getSpeechConfig();
    const ac = getAudioConfig();
    
    if (typeof languageOrDetectConfig === 'string') {
        sc.speechRecognitionLanguage = languageOrDetectConfig;
        recognizer = new sdk.SpeechRecognizer(sc, ac);
    } else {
        recognizer = sdk.SpeechRecognizer.FromConfig(sc, languageOrDetectConfig, ac);
    }

    return recognizer;
}

// --- Public API ---

export type PronunciationAssessmentResult = {
  accuracy: number;
  fluency: number;
  completeness: number;
  pronScore: number;
  isPass: boolean;
};

export async function recognizeFromMic(fromLanguage: LanguageCode): Promise<string> {
    const locale = languageToLocaleMap[fromLanguage];
    if (!locale) throw new Error("Unsupported language for recognition.");
    
    const r = getRecognizer(locale);

    return new Promise<string>((resolve, reject) => {
        r.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}. Details: ${cancellation.errorDetails || 'No details'}`));
            }
        }, err => {
            reject(new Error(`Recognition error: ${err}`));
        });
    });
}

export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const r = getRecognizer(locale);

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(r);

    return new Promise((resolve, reject) => {
        r.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
            } else {
                 const cancellation = sdk.CancellationDetails.fromResult(result);
                 const errorDetails = cancellation.errorDetails || `Reason: ${sdk.ResultReason[result.reason]}`;
                 reject(new Error(`Recognition failed: ${errorDetails}`));
            }
        }, err => {
             reject(new Error(`Assessment error: ${err}`));
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const r = getRecognizer(autoDetectConfig);
    
    return new Promise((resolve, reject) => {
         r.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                reject(new Error(cancellation.errorDetails || "No speech could be recognized."));
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
    const r = getRecognizer(language);

    r.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            recognizedCallback(e.result.text);
        }
    };

    r.canceled = (s, e) => {
        if (e.reason === sdk.CancellationReason.Error) {
            errorCallback(e.errorDetails);
        }
        stoppedCallback();
    };

    r.sessionStopped = (s, e) => {
        stoppedCallback();
    };
    
    return r;
}

export function abortRecognition() {
    if (recognizer) {
        recognizer.stopContinuousRecognitionAsync(
            () => {
                // Successfully stopped
            },
            (err) => {
                // Log error but don't throw, as we're just trying to cleanup.
                console.error("Error stopping recognizer:", err);
            }
        );
        recognizer.close();
        recognizer = null;
    }
}
