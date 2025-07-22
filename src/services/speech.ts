
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
let safetyTimeout: NodeJS.Timeout | null = null;

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
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }
    if (activeRecognizer) {
        const recognizerToStop = activeRecognizer;
        const recognizerIdToStop = activeRecognizerId;
        console.log(`[speech.ts] Aborting recognizer: ${recognizerIdToStop}`);
        
        // Nullify immediately to prevent race conditions
        activeRecognizer = null;
        activeRecognizerId = null;

        try {
            // This will trigger the 'canceled' event on the recognizer.
            recognizerToStop.stopContinuousRecognitionAsync(
                () => {
                    console.log(`[speech.ts] Successfully stopped recognizer: ${recognizerIdToStop}`);
                },
                (err) => {
                     console.warn(`[speech.ts] Error on stopping recognizer ${recognizerIdToStop}:`, err);
                }
            );
        } catch (e) {
            console.warn(`[speech.ts] Exception while stopping recognizer ${recognizerIdToStop}, it may have already been closed.`, e);
        }
    }
}


/**
 * Performs pronunciation assessment with auto-stop and a safety timeout.
 * @param referenceText The text to compare against.
 * @param lang The language of the text.
 * @param debugId A unique ID for this assessment attempt for logging.
 * @returns {Promise<PronunciationAssessmentResult>}
 */
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode, debugId?: string): Promise<PronunciationAssessmentResult> {
    const currentAssessmentId = debugId || `assessment-${Date.now()}`;
    
    if (activeRecognizer) {
        console.log(`[speech.ts] New assessment (${currentAssessmentId}) requested while another is active (${activeRecognizerId}). Aborting old one.`);
        abortRecognition();
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    console.log(`[speech.ts] Starting assessment ${currentAssessmentId} for lang: ${locale}`);
    
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
        const cleanup = () => {
             console.log(`[speech.ts] Cleanup for ${currentAssessmentId}.`);
            if (safetyTimeout) {
                clearTimeout(safetyTimeout);
                safetyTimeout = null;
            }
             if (activeRecognizerId === currentAssessmentId) {
                recognizer.close();
                activeRecognizer = null;
                activeRecognizerId = null;
                console.log(`[speech.ts] Recognizer ${currentAssessmentId} closed and nulled.`);
            }
        };
        
        console.log(`[speech.ts] Setting 10s safety timeout for ${currentAssessmentId}.`);
        safetyTimeout = setTimeout(() => {
            console.error(`[speech.ts] Assessment ${currentAssessmentId} hit 10-second safety timeout.`);
            reject(new Error("Assessment timed out after 10 seconds."));
            cleanup();
        }, 10000);

        recognizer.recognized = (s, e) => {
            console.log(`[speech.ts] Event 'recognized' for ${currentAssessmentId}. Result: ${sdk.ResultReason[e.result.reason]}`);
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                const assessment = sdk.PronunciationAssessmentResult.fromResult(e.result);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                 reject(new Error("Could not recognize speech. Please try again."));
            }
        };

        recognizer.speechEndDetected = (s, e) => {
            console.log(`[speech.ts] Event 'speechEndDetected' for ${currentAssessmentId}. Stopping recognizer.`);
            recognizer.stopContinuousRecognitionAsync();
        };
        
        recognizer.canceled = (s, e) => {
             console.log(`[speech.ts] Event 'canceled' for ${currentAssessmentId}. Reason: ${sdk.CancellationReason[e.reason]}`);
            if (e.reason === sdk.CancellationReason.Error) {
                reject(new Error(e.errorDetails));
            } else if (e.reason !== sdk.CancellationReason.CancelledByUser) {
                reject(new Error("Recognition was canceled unexpectedly."));
            }
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
                console.error(`[speech.ts] Could not start microphone for ${currentAssessmentId}:`, err);
                reject(new Error(`Could not start microphone: ${err}`));
                cleanup();
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
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else {
                 reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}.`));
            }
            recognizer.close();
        }, err => {
            reject(new Error(`Recognition error: ${err}`));
            recognizer.close();
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    
    return new Promise((resolve, reject) => {
         recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                reject(new Error("No speech could be recognized."));
            }
            recognizer.close();
        }, err => {
            reject(new Error(`Auto-detect recognition error: ${err}`));
            recognizer.close();
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
