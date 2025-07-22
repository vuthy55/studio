
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
        console.log(`[SpeechService] ABORT triggered. Closing active recognizer.`);
        try {
            // For continuous recognition, we need to stop it first.
            // For recognizeOnceAsync, close() is sufficient but stopping doesn't hurt.
            activeRecognizer.stopContinuousRecognitionAsync(
                () => { console.log(`[SpeechService] Continuous recognition stopped.`); },
                (err) => { console.error(`[SpeechService] Error stopping continuous recognition: ${err}`); }
            );
            activeRecognizer.close();
            console.log(`[SpeechService] Recognizer closed.`);
        } catch (e) {
            console.error("[SpeechService] Error during recognizer.close(): ", e);
        } finally {
            activeRecognizer = null;
            console.log(`[SpeechService] activeRecognizer set to null.`);
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
    console.log(`[SPEECH] Starting assessment for "${referenceText}" in ${locale}`);

    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    
    // This is the important fix: We need to set the language on the speechConfig BEFORE creating the recognizer.
    speechConfig.speechRecognitionLanguage = locale;
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    // Set the recognizer instance for potential abortion
    activeRecognizer = recognizer;

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );

    pronunciationConfig.applyTo(recognizer);
    console.log(`[SPEECH] PronunciationAssessmentConfig created and applied.`);


    return new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            console.log(`[SPEECH] recognizeOnceAsync completed. Result reason: ${sdk.ResultReason[result.reason]}`);
            
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
                console.log(`[SPEECH] Assessment successful. Accuracy: ${assessment.accuracyScore}, PronScore: ${assessment.pronunciationScore}`);
                resolve({
                    accuracy: assessment.accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: assessment.accuracyScore > 70
                });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
                 console.error('[SPEECH] No speech could be recognized.');
                 reject(new Error("Could not recognize speech. Please try again."));
            } else if (result.reason === sdk.ResultReason.Canceled) {
                 const cancellation = sdk.CancellationDetails.fromResult(result);
                 console.error(`[SPEECH] Recognition canceled. Reason: ${sdk.CancellationReason[cancellation.reason]}. Details: ${cancellation.errorDetails}`);
                 reject(new Error(`Recognition failed: ${cancellation.errorDetails}`));
            }
            
            // Cleanup
            abortRecognition();
        }, err => {
            console.error(`[SPEECH] recognizeOnceAsync threw an error: ${err}`);
            reject(new Error(`Recognition error: ${err}`));
            // Cleanup
            abortRecognition();
        });
    });
}


export async function recognizeFromMic(fromLanguage: LanguageCode): Promise<string> {
    const locale = languageToLocaleMap[fromLanguage];
    if (!locale) throw new Error("Unsupported language for recognition.");

    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = locale;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    activeRecognizer = recognizer;


    return new Promise<string>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else {
                 reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}.`));
            }
            abortRecognition();
        }, err => {
            reject(new Error(`Recognition error: ${err}`));
            abortRecognition();
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    
    activeRecognizer = recognizer;
    
    return new Promise((resolve, reject) => {
         recognizer.recognizeOnceAsync(result => {
            console.log(`[SpeechService] recognizeWithAutoDetect: recognition complete. Reason: ${sdk.ResultReason[result.reason]}.`);
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                resolve({
                    detectedLang: autoDetectResult.language,
                    text: result.text
                });
            } else {
                reject(new Error("No recognized speech"));
            }
            abortRecognition();
        }, err => {
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
