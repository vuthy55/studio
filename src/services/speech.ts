
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


export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode, debugId?: string): Promise<PronunciationAssessmentResult> {
    const currentAssessmentId = debugId || `assessment-${Date.now()}`;
    
    if (activeRecognizer) {
        console.warn(`[speech.ts] New assessment (${currentAssessmentId}) requested while another is active (${activeRecognizerId}). Aborting old one.`);
        abortRecognition();
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

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

    return new Promise((resolve, reject) => {
        let recognized = false;
        let timeoutId: NodeJS.Timeout | null = null;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (activeRecognizerId === currentAssessmentId) {
                console.log(`[speech.ts] Cleanup for ${currentAssessmentId}.`);
                recognizer.close();
                activeRecognizer = null;
                activeRecognizerId = null;
            }
        };
        
        timeoutId = setTimeout(() => {
            console.log(`[speech.ts] Assessment ${currentAssessmentId} hit 5-second safety timeout.`);
            reject(new Error("Assessment timed out after 5 seconds."));
            cleanup();
        }, 5000);

        recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                if (recognized) return;
                recognized = true;
                
                const assessment = sdk.PronunciationAssessmentResult.fromResult(e.result);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
                recognizer.stopContinuousRecognitionAsync(() => {}, () => {});
            }
        };
        
        recognizer.canceled = (s, e) => {
             if (recognized) return;
             if (e.reason === sdk.CancellationReason.Error) {
                reject(new Error(`Assessment canceled: ${e.errorDetails}`));
             } else {
                 reject(new Error("Assessment was canceled."));
             }
        };

        recognizer.sessionStopped = (s, e) => {
             cleanup();
        };

        recognizer.startContinuousRecognitionAsync(
            () => {},
            (err) => {
                reject(new Error(`Could not start microphone: ${err}`));
            }
        );
    });
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
