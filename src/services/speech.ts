
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
// We manage these at the module level to ensure only one recognition process can happen at a time.
let activeRecognizer: sdk.SpeechRecognizer | null = null;
let recognitionPromise: {
    promise: Promise<PronunciationAssessmentResult>;
    resolve: (value: PronunciationAssessmentResult) => void;
    reject: (reason?: any) => void;
} | null = null;
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
    console.log('[DEBUG] Aborting recognition explicitly.');
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }
    if (activeRecognizer) {
        try {
            // This attempts to stop the recognizer and rejects the ongoing promise.
            activeRecognizer.stopContinuousRecognitionAsync();
            activeRecognizer.close();
            recognitionPromise?.reject(new Error("Recognition was aborted."));
        } catch (e) {
            console.error("[DEBUG] Error during abort: ", e);
        } finally {
            activeRecognizer = null;
            recognitionPromise = null;
        }
    }
}


export async function startPronunciationAssessment(referenceText: string, lang: LanguageCode): Promise<void> {
    if (activeRecognizer) {
        console.warn("[DEBUG] An active recognition is already in progress. Aborting previous one.");
        abortRecognition();
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = locale;
    
    console.log("[DEBUG] Audio resource CREATING...");
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    console.log("[DEBUG] Audio resource CREATED.");

    activeRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(activeRecognizer);
    
    // Set up a deferred promise that we can resolve/reject later
    let resolver: (value: PronunciationAssessmentResult) => void;
    let rejecter: (reason?: any) => void;
    const promise = new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });
    recognitionPromise = { promise, resolve: resolver!, reject: rejecter! };
    
    // This is our safety net. If stop isn't called, abort after 10s.
    safetyTimeout = setTimeout(() => {
        console.log('[DEBUG] 10-second safety timeout reached. Aborting recognition.');
        abortRecognition();
    }, 10000);

    activeRecognizer.recognized = (s, e) => {
        // This event fires when speech is recognized.
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            console.log('[DEBUG] Speech recognized. Processing assessment.');
            const assessment = sdk.PronunciationAssessmentResult.fromResult(e.result);
            recognitionPromise?.resolve({
                accuracy: assessment.accuracyScore,
                fluency: assessment.fluencyScore,
                completeness: assessment.completenessScore,
                pronScore: assessment.pronunciationScore,
                isPass: assessment.accuracyScore > 70
            });
        }
    };
    
    activeRecognizer.canceled = (s, e) => {
        console.log(`[DEBUG] Recognition canceled. Reason: ${sdk.CancellationReason[e.reason]}`);
        if (e.reason === sdk.CancellationReason.Error) {
            recognitionPromise?.reject(new Error(e.errorDetails));
        }
    };

    activeRecognizer.sessionStopped = (s, e) => {
        console.log('[DEBUG] Session stopped.');
        // This is often where we know the process is over.
        // We can reject here if the promise is still pending, means no result was found.
        recognitionPromise?.reject(new Error("Recognition session ended without a result."));
    };

    console.log('[DEBUG] Starting continuous recognition...');
    activeRecognizer.startContinuousRecognitionAsync();
}

export async function stopPronunciationAssessment(): Promise<PronunciationAssessmentResult> {
    console.log("[DEBUG] stopPronunciationAssessment called.");
    
    if (!activeRecognizer || !recognitionPromise) {
        throw new Error("Recognition not started or already stopped.");
    }
    
    // Clear the safety timeout since we are stopping manually.
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }

    try {
        console.log('[DEBUG] Calling stopContinuousRecognitionAsync...');
        activeRecognizer.stopContinuousRecognitionAsync();
        
        // Now, we wait for the promise that was set up in the 'start' function.
        // The .recognized event handler will resolve it.
        const result = await recognitionPromise.promise;
        return result;

    } catch (error) {
        console.error("[DEBUG] Error while stopping or awaiting recognition promise:", error);
        throw error; // Re-throw the error to be caught by the calling component
    } finally {
        // --- Guaranteed Cleanup ---
        console.log("[DEBUG] Cleaning up resources.");
        activeRecognizer.close();
        activeRecognizer = null;
        recognitionPromise = null;
    }
}


// --- Legacy & Other Functions ---

// DEPRECATED - This function will not work correctly with the new start/stop model.
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    console.warn("DEPRECATED: assessPronunciationFromMic is called. Use start/stop pattern instead.");
    throw new Error("assessPronunciationFromMic is deprecated. Please use the start/stop pattern.");
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
