
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
let recognizerPromise: Promise<void> | null = null;

function getSpeechConfig(): sdk.SpeechConfig {
    if (speechConfig) return speechConfig;
    console.log("[Speech Service] Creating new SpeechConfig singleton.");

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
    console.log("[Speech Service] Creating new AudioConfig singleton.");

    if (typeof window === 'undefined') {
        throw new Error("Microphone access is only available in the browser.");
    }
    audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    return audioConfig;
}

function createRecognizer(languageOrDetectConfig: string | sdk.AutoDetectSourceLanguageConfig): sdk.SpeechRecognizer {
    // If a recognizer exists, abort it before creating a new one.
    if (recognizer) {
        console.warn("[Speech Service] A recognizer already exists. Aborting it before creating a new one.");
        abortRecognition();
    }
    
    console.log("[Speech Service] Creating new SpeechRecognizer instance.");
    const sc = getSpeechConfig();
    const ac = getAudioConfig();
    
    if (typeof languageOrDetectConfig === 'string') {
        sc.speechRecognitionLanguage = languageOrDetectConfig;
        recognizer = new sdk.SpeechRecognizer(sc, ac);
    } else {
        // Must clear the specific language if we are using auto-detect
        sc.speechRecognitionLanguage = '';
        recognizer = sdk.SpeechRecognizer.FromConfig(sc, languageOrDetectConfig, ac);
    }

    // Detach any old handlers and attach new ones.
    recognizer.sessionStarted = (s, e) => {
        console.log(`[Speech Service] Session started: ${e.sessionId}`);
    };
    recognizer.sessionStopped = (s, e) => {
        console.log(`[Speech Service] Session stopped: ${e.sessionId}`);
    };
    recognizer.canceled = (s, e) => {
        console.error(`[Speech Service] Recognizer CANCELED: ${e.errorDetails} [${sdk.CancellationReason[e.reason]}]`);
        abortRecognition();
    };

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
    
    const r = createRecognizer(locale);
    console.log("[Speech Service] Starting single-shot recognition...");

    return new Promise<string>((resolve, reject) => {
        r.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                console.log(`[Speech Service] Recognized: "${result.text}"`);
                resolve(result.text);
            } else {
                const reason = sdk.ResultReason[result.reason];
                const errorDetails = sdk.CancellationDetails.fromResult(result).errorDetails || 'No details';
                console.error(`[Speech Service] Could not recognize speech. Reason: ${reason}. Details: ${errorDetails}`);
                reject(new Error(`Could not recognize speech. Reason: ${reason}.`));
            }
             abortRecognition();
        }, err => {
            console.error(`[Speech Service] Recognition error callback: ${err}`);
            reject(new Error(`Recognition error: ${err}`));
             abortRecognition();
        });
    });
}

export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const r = createRecognizer(locale);
    console.log("[Speech Service] Starting pronunciation assessment...");

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
                console.log("[Speech Service] Assessment successful.");
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
                 console.error(`[Speech Service] Assessment failed: ${errorDetails}`);
                 reject(new Error(`Assessment failed: ${errorDetails}`));
            }
             abortRecognition();
        }, err => {
             console.error(`[Speech Service] Assessment error callback: ${err}`);
             reject(new Error(`Assessment error: ${err}`));
             abortRecognition();
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const r = createRecognizer(autoDetectConfig);
    console.log(`[Speech Service] Starting auto-detect recognition for [${languages.join(', ')}]...`);
    
    return new Promise((resolve, reject) => {
         r.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                console.log(`[Speech Service] Auto-detect successful. Language: ${autoDetectResult.language}, Text: "${result.text}"`);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                const reason = sdk.ResultReason[result.reason];
                const err = cancellation.errorDetails || `Reason: ${reason}`;
                console.error(`[Speech Service] Auto-detect failed: ${err}`);
                reject(new Error(err));
            }
             abortRecognition();
        }, err => {
            console.error(`[Speech Service] Auto-detect error callback: ${err}`);
            reject(new Error(`Auto-detect recognition error: ${err}`));
             abortRecognition();
        });
    });
}

export function getContinuousRecognizerForRoom(
    language: string,
    recognizedCallback: (text: string) => void,
    errorCallback: (errorDetails: string) => void,
    stoppedCallback: () => void
): sdk.SpeechRecognizer {
    const r = createRecognizer(language);

    r.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            recognizedCallback(e.result.text);
        }
    };

    // Replace the generic handlers with the specific ones for this mode.
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
        console.log("[Speech Service] ABORTING recognition...");
        // Disconnect events to prevent race conditions during cleanup
        recognizer.recognized = undefined;
        recognizer.recognizing = undefined;
        recognizer.sessionStarted = undefined;
        recognizer.sessionStopped = undefined;
        recognizer.canceled = undefined;

        // Force stop and then close
        recognizer.stopContinuousRecognitionAsync(
            () => {
                // Now close it
                recognizer!.close();
                recognizer = null;
                console.log("[Speech Service] Recognizer successfully CLOSED.");
            },
            (err) => {
                console.error("[Speech Service] Error stopping recognizer:", err);
                recognizer!.close();
                recognizer = null;
                 console.log("[Speech Service] Recognizer forcibly CLOSED after error.");
            }
        );
    }
}
