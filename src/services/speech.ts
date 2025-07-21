
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
let activePushStream: sdk.PushAudioInputStream | null = null;
let recognitionPromise: Promise<PronunciationAssessmentResult> | null = null;

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


export async function startPronunciationAssessment(referenceText: string, lang: LanguageCode): Promise<void> {
    if (activeRecognizer) {
        console.warn("[DEBUG] An active recognition is already in progress. Aborting it first.");
        await stopPronunciationAssessment().catch(() => {});
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = locale;

    console.log("[DEBUG] Audio resource CREATING...");
    activePushStream = sdk.AudioInputStream.createPushStream();
    const audioConfig = sdk.AudioConfig.fromStreamInput(activePushStream);
    console.log("[DEBUG] Audio resource CREATED.");

    activeRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(activeRecognizer);

    recognitionPromise = new Promise((resolve, reject) => {
        activeRecognizer!.recognizeOnceAsync(result => {
            console.log(`[DEBUG] recognizeOnceAsync result received: ${sdk.ResultReason[result.reason]}`);
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
                const reason = sdk.ResultReason[result.reason];
                const errorDetails = result.errorDetails || 'No details.';
                console.error(`[DEBUG] Recognition failed. Reason: ${reason}. Details: ${errorDetails}`);
                reject(new Error(`Could not recognize speech. Reason: ${reason}.`));
            }
        }, err => {
            console.error(`[DEBUG] recognizeOnceAsync error callback: ${err}`);
            reject(new Error(`Recognition error: ${err}`));
        });
    });

    console.log('[DEBUG] startContinuousRecognitionAsync called to begin capturing audio.');
    activeRecognizer.startContinuousRecognitionAsync(
        () => {}, // Do nothing on start
        err => {
            console.error(`[DEBUG] startContinuousRecognitionAsync error: ${err}`);
        }
    );
}

export async function stopPronunciationAssessment(): Promise<PronunciationAssessmentResult> {
    console.log("[DEBUG] stopPronunciationAssessment called.");
    if (!activeRecognizer || !recognitionPromise) {
        throw new Error("Recognition not started.");
    }
    
    // Stop the recognizer from listening for more audio
    console.log('[DEBUG] stopContinuousRecognitionAsync called to end capturing audio.');
    activeRecognizer.stopContinuousRecognitionAsync();
    
    // Signal that the audio stream is complete
    activePushStream?.close();

    try {
        const result = await recognitionPromise;
        return result;
    } finally {
        // --- Guaranteed Cleanup ---
        console.log("[DEBUG] Audio resource DESTROYING...");
        activeRecognizer.close();
        console.log("[DEBUG] Audio resource DESTROYED.");
        activeRecognizer = null;
        recognitionPromise = null;
        activePushStream = null;
    }
}


// --- Legacy Functions - To be removed or refactored ---

// This function is known to have issues and should be replaced by the start/stop pattern.
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    console.warn("DEPRECATED: assessPronunciationFromMic is called. Use start/stop pattern instead.");
    await startPronunciationAssessment(referenceText, lang);
    // This will likely fail without manual stop, but we keep it for now.
    return stopPronunciationAssessment();
}

export function abortRecognition() {
    if (activeRecognizer) {
        console.log('[DEBUG] Aborting recognition explicitly.');
        try {
            activeRecognizer.stopContinuousRecognitionAsync();
            activeRecognizer.close();
        } catch (e) {
            console.error("[DEBUG] Error during abort: ", e);
        } finally {
            activeRecognizer = null;
            recognitionPromise = null;
            activePushStream = null;
        }
    }
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
