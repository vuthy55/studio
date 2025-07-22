
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
let activeRecognizerId: string | null = null;

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
    console.log(`[speech.ts] Abort called. Active recognizer ID: ${activeRecognizerId}`);
    if (activeRecognizer) {
        const recognizerToClose = activeRecognizer;
        const recognizerIdToClose = activeRecognizerId;

        activeRecognizer = null;
        activeRecognizerId = null;

        console.log(`[speech.ts] Aborting recognizer: ${recognizerIdToClose} by closing it.`);
        recognizerToClose.close();
    }
}


export function assessPronunciationFromMic(
    referenceText: string,
    lang: LanguageCode,
    onSuccess: (result: PronunciationAssessmentResult) => void,
    onError: (error: Error) => void,
    debugId?: string
) {
    const currentAssessmentId = debugId || `assessment-${Date.now()}`;
    console.log(`[speech.ts] Starting assessment ${currentAssessmentId} for lang: ${lang}`);
    
    if (activeRecognizer) {
        console.warn(`[speech.ts] New assessment (${currentAssessmentId}) requested while another is active (${activeRecognizerId}). Aborting old one.`);
        abortRecognition();
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) {
        onError(new Error("Unsupported language for assessment."));
        return;
    }

    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    activeRecognizer = recognizer;
    activeRecognizerId = currentAssessmentId;

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(recognizer);

    let recognized = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (activeRecognizerId === currentAssessmentId) {
            console.log(`[speech.ts] Cleanup for ${currentAssessmentId}.`);
            recognizer.close();
            activeRecognizer = null;
            activeRecognizerId = null;
        } else {
             console.log(`[speech.ts] Cleanup called for ${currentAssessmentId}, but active recognizer is now ${activeRecognizerId}. No action taken.`);
        }
    };
    
    console.log(`[speech.ts] Setting 5s safety timeout for ${currentAssessmentId}.`);
    timeoutId = setTimeout(() => {
        if (recognized) return;
        console.error(`[speech.ts] Assessment ${currentAssessmentId} hit 5-second safety timeout.`);
        onError(new Error("Assessment timed out after 5 seconds."));
        cleanup();
    }, 5000);

    recognizer.recognized = (s, e) => {
        console.log(`[speech.ts] Event 'recognized' for ${currentAssessmentId}. Result: ${sdk.ResultReason[e.result.reason]}`);
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            if (recognized) return; // Process only the first valid recognition
            recognized = true;
            
            const assessment = sdk.PronunciationAssessmentResult.fromResult(e.result);
            console.log(`[speech.ts] Assessment success for ${currentAssessmentId}. Calling onSuccess callback.`);
            onSuccess({
                accuracy: assessment.accuracyScore,
                fluency: assessment.fluencyScore,
                completeness: assessment.completenessScore,
                pronScore: assessment.pronunciationScore,
                isPass: assessment.accuracyScore > 70
            });
            recognizer.stopContinuousRecognitionAsync(cleanup, cleanup);
        }
    };
    
    recognizer.canceled = (s, e) => {
         console.log(`[speech.ts] Event 'canceled' for ${currentAssessmentId}. Reason: ${sdk.CancellationReason[e.reason]}`);
         if (recognized) return;
         if (e.reason === sdk.CancellationReason.Error) {
            onError(new Error(`Assessment canceled: ${e.errorDetails}`));
         }
         cleanup();
    };

    recognizer.sessionStopped = (s, e) => {
        console.log(`[speech.ts] Event 'sessionStopped' for ${currentAssessmentId}. Cleaning up.`);
        cleanup();
    };

    recognizer.startContinuousRecognitionAsync(
        () => {
            console.log(`[speech.ts] Session started for ${currentAssessmentId}.`);
        },
        (err) => {
            onError(new Error(`Could not start microphone: ${err}`));
            cleanup();
        }
    );
}


export async function recognizeFromMic(fromLanguage: LanguageCode): Promise<string> {
    const locale = languageToLocaleMap[fromLanguage];
    if (!locale) throw new Error("Unsupported language for recognition.");

    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = locale;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise<string>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            recognizer.close();
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else {
                 reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}.`));
            }
        }, err => {
            recognizer.close();
            reject(new Error(`Recognition error: ${err}`));
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    if (activeRecognizer) {
        console.warn(`[speech.ts] Auto-detect requested while another recognizer is active. Aborting old one.`);
        abortRecognition();
    }
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    activeRecognizer = recognizer;
    activeRecognizerId = `autodetect-${Date.now()}`;
    
    return new Promise((resolve, reject) => {
         recognizer.recognizeOnceAsync(result => {
            if (activeRecognizer === recognizer) {
                recognizer.close();
                activeRecognizer = null;
                activeRecognizerId = null;
            }
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                reject(new Error("No speech could be recognized."));
            }
        }, err => {
            if (activeRecognizer === recognizer) {
                recognizer.close();
                activeRecognizer = null;
                activeRecognizerId = null;
            }
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
    activeRecognizerId = `room-${new Date().getTime()}`;

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
        if (activeRecognizer === recognizer) {
            recognizer.close();
            activeRecognizer = null;
            activeRecognizerId = null;
        }
    };
    
    return recognizer;
}
