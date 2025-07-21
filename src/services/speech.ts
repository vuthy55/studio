
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
// This allows us to have a single point of control for aborting an in-progress recognition.
let activeRecognizer: sdk.SpeechRecognizer | null = null;


function getSpeechConfig(): sdk.SpeechConfig {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured in your .env file.");
    }
    const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    return speechConfig;
}

function createRecognizer(languageOrDetectConfig: string | sdk.AutoDetectSourceLanguageConfig): sdk.SpeechRecognizer {
    // Abort any existing recognition before creating a new one.
    if (activeRecognizer) {
        console.log('[DEBUG] Aborting previous recognizer before creating new one.');
        abortRecognition();
    }
    
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    
    if (typeof languageOrDetectConfig === 'string') {
        speechConfig.speechRecognitionLanguage = languageOrDetectConfig;
        console.log(`[DEBUG] Creating new SpeechRecognizer for language: ${languageOrDetectConfig}`);
        activeRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    } else {
        console.log('[DEBUG] Creating new SpeechRecognizer for auto-detection');
        activeRecognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, languageOrDetectConfig, audioConfig);
    }

    // Attach session event listeners for debugging the handshake
    activeRecognizer.sessionStarted = (s, e) => {
        console.log(`[DEBUG] Azure Speech session started. SessionId: ${e.sessionId}`);
    };

    activeRecognizer.sessionStopped = (s, e) => {
        console.log(`[DEBUG] Azure Speech session stopped. SessionId: ${e.sessionId}`);
        activeRecognizer?.close();
        activeRecognizer = null;
    };

    return activeRecognizer;
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
    
    const recognizer = createRecognizer(locale);

    return new Promise<string>((resolve, reject) => {
        console.log('[DEBUG] recognizeOnceAsync started.');
        recognizer.recognizeOnceAsync(result => {
            console.log(`[DEBUG] recognizeOnceAsync result received: ${sdk.ResultReason[result.reason]}`);
            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                resolve(result.text);
            } else if (result.reason === sdk.ResultReason.NoMatch) {
                const noMatchDetails = sdk.NoMatchDetails.fromResult(result);
                reject(new Error(`No speech could be recognized. Reason: ${sdk.NoMatchReason[noMatchDetails.reason]}`));
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}. Details: ${cancellation.errorDetails || 'No details'}`));
            }
            recognizer.close();
            activeRecognizer = null;
        }, err => {
            console.error(`[DEBUG] recognizeOnceAsync error callback: ${err}`);
            reject(new Error(`Recognition error: ${err}`));
            recognizer.close();
            activeRecognizer = null;
        });
    });
}

export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");

    const recognizer = createRecognizer(locale);

    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(recognizer);

    const recognitionPromise = new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        console.log('[DEBUG] assessPronunciation recognizeOnceAsync started.');
        recognizer.recognizeOnceAsync(result => {
            console.log(`[DEBUG] assessPronunciation result received: ${sdk.ResultReason[result.reason]}`);
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
                const noMatchDetails = sdk.NoMatchDetails.fromResult(result);
                const reasonText = sdk.NoMatchReason[noMatchDetails.reason];
                reject(new Error(`No speech was detected. Please try again. (Reason: ${reasonText})`));
            } else {
                 const cancellation = sdk.CancellationDetails.fromResult(result);
                 const errorDetails = cancellation.errorDetails || `Reason: ${sdk.ResultReason[result.reason]}`;
                 reject(new Error(`Recognition failed: ${errorDetails}`));
            }
            recognizer.close();
            activeRecognizer = null;
        }, err => {
             console.error(`[DEBUG] assessPronunciation error callback: ${err}`);
             reject(new Error(`Assessment error: ${err}`));
             recognizer.close();
             activeRecognizer = null;
        });
    });

    const timeoutPromise = new Promise<PronunciationAssessmentResult>((_, reject) =>
        setTimeout(() => {
            console.log('[DEBUG] 10-second timeout reached. Aborting recognition.');
            abortRecognition();
            reject(new Error('Assessment timed out after 10 seconds.'));
        }, 10000)
    );

    return Promise.race([recognitionPromise, timeoutPromise]);
}


export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const recognizer = createRecognizer(autoDetectConfig);
    
    return new Promise((resolve, reject) => {
         recognizer.recognizeOnceAsync(result => {
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
            recognizer.close();
            activeRecognizer = null;
        }, err => {
            reject(new Error(`Auto-detect recognition error: ${err}`));
            recognizer.close();
            activeRecognizer = null;
        });
    });
}

export function getContinuousRecognizerForRoom(
    language: string,
    recognizedCallback: (text: string) => void,
    errorCallback: (errorDetails: string) => void,
    stoppedCallback: () => void
): sdk.SpeechRecognizer {
    const recognizer = createRecognizer(language);

    recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            recognizedCallback(e.result.text);
        }
    };

    recognizer.canceled = (s, e) => {
        console.log(`[DEBUG] Continuous recognition CANCELED: ${e.errorDetails}`);
        if (e.reason === sdk.CancellationReason.Error) {
            errorCallback(e.errorDetails);
        }
        stoppedCallback();
    };

    recognizer.sessionStopped = (s, e) => {
        console.log('[DEBUG] Continuous recognition session STOPPED.');
        stoppedCallback();
    };
    
    return recognizer;
}

export function abortRecognition() {
    if (activeRecognizer) {
        console.log('[DEBUG] Aborting recognition explicitly.');
        activeRecognizer.close();
        activeRecognizer = null;
    }
}
