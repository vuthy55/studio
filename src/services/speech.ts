
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
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }
    if (activeRecognizer) {
        try {
            activeRecognizer.stopContinuousRecognitionAsync();
            activeRecognizer.close();
        } catch (e) {
            console.error("[DEBUG] Error during abort: ", e);
        } finally {
            activeRecognizer = null;
        }
    }
}


/**
 * Performs pronunciation assessment with auto-stop and a safety timeout.
 * @param referenceText The text to compare against.
 * @param lang The language of the text.
 * @returns {Promise<PronunciationAssessmentResult>}
 */
export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    if (activeRecognizer) {
        console.warn("[DEBUG] An active recognition is already in progress. Aborting previous one.");
        abortRecognition();
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    activeRecognizer = recognizer;
    
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(recognizer);

    return new Promise((resolve, reject) => {
        // --- Safety Timeout ---
        safetyTimeout = setTimeout(() => {
            console.log('[DEBUG] 5-second safety timeout reached. Aborting recognition.');
            recognizer.stopContinuousRecognitionAsync();
            reject(new Error("Assessment timed out after 5 seconds."));
        }, 5000);

        recognizer.recognized = (s, e) => {
             // The main event. Fires when speech is recognized and processed.
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                console.log('[DEBUG] Speech recognized. Processing assessment.');
                const assessment = sdk.PronunciationAssessmentResult.fromResult(e.result);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                 console.log('[DEBUG] No speech could be recognized.');
                 reject(new Error("Could not recognize speech. Please try again."));
            }
        };

        recognizer.speechEndDetected = (s, e) => {
            console.log('[DEBUG] Speech end detected. Stopping recognizer.');
            recognizer.stopContinuousRecognitionAsync();
        };
        
        recognizer.canceled = (s, e) => {
            console.log(`[DEBUG] Recognition canceled. Reason: ${sdk.CancellationReason[e.reason]}`);
            if (e.reason === sdk.CancellationReason.Error) {
                reject(new Error(e.errorDetails));
            } else {
                reject(new Error("Recognition was canceled."));
            }
        };

        recognizer.sessionStopped = (s, e) => {
            // This is the final cleanup trigger.
            console.log('[DEBUG] Session stopped.');
            if (safetyTimeout) clearTimeout(safetyTimeout);
            recognizer.close();
            activeRecognizer = null;
        };

        // --- Start the recognition process ---
        recognizer.startContinuousRecognitionAsync(
            () => { console.log('[DEBUG] Recognition session started.'); },
            (err) => {
                console.error(`[DEBUG] Error starting recognition: ${err}`);
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
