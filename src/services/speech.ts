
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

function getSpeechConfig(): sdk.SpeechConfig {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        throw new Error("Azure credentials are not configured in your .env file.");
    }
    return sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
}

export function abortRecognition() {}

export type PronunciationAssessmentResult = {
  accuracy: number;
  fluency: number;
  completeness: number;
  pronScore: number;
  isPass: boolean;
};

export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error(`[SPEECH] Unsupported language for assessment: ${lang}`);
    
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    speechConfig.speechRecognitionLanguage = locale;
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
    );
    pronunciationConfig.applyTo(recognizer);

    return new Promise<PronunciationAssessmentResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            try {
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
                    reject(new Error("Could not recognize speech. Please try again."));
                } else if (result.reason === sdk.ResultReason.Canceled) {
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    if (cancellation.reason === sdk.CancellationReason.Error) {
                        reject(new Error(`Recognition failed: ${cancellation.errorDetails}`));
                    } else {
                        reject(new Error("Recognition was aborted."));
                    }
                }
            } finally {
                recognizer.close();
            }
        }, err => {
            try {
                reject(new Error(`Recognition error: ${err}`));
            } finally {
                recognizer.close();
            }
        });
    });
}

export async function recognizeFromMic(fromLanguage: AzureLanguageCode): Promise<string> {
    if (!fromLanguage) throw new Error("A valid language code must be provided for recognition.");
    
    const speechConfig = getSpeechConfig();
    speechConfig.speechRecognitionLanguage = fromLanguage;
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise<string>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            try {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    resolve(result.text);
                } else if (result.reason === sdk.ResultReason.NoMatch) {
                    resolve('');
                } else if (result.reason === sdk.ResultReason.Canceled) {
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    if (cancellation.reason === sdk.CancellationReason.Error) {
                         let errorMessage = `Recognition canceled: ${cancellation.errorDetails}`;
                        if (cancellation.ErrorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
                            errorMessage = "Recognition failed due to an authentication error. Please check your Azure credentials and microphone permissions.";
                        }
                        reject(new Error(errorMessage));
                    } else {
                        reject(new Error("Recognition was aborted."));
                    }
                } else {
                    reject(new Error(`Could not recognize speech. Reason: ${result.reason}`));
                }
            } finally {
                recognizer.close();
            }
        }, err => {
            try {
                reject(new Error(`Recognition error: ${err}`));
            } finally {
                recognizer.close();
            }
        });
    });
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[], log: (message: string) => void): Promise<{ detectedLang: string, text: string }> {
    log(`[SpeechService] Initializing auto-detect for: ${languages.join(', ')}`);
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
    
    return new Promise<{ detectedLang: string, text: string }>((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            log(`[SpeechService] recognizer.recognizeOnceAsync callback triggered. Reason: ${sdk.ResultReason[result.reason]}`);
            try {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                    log(`[SpeechService] Success. Detected: ${autoDetectResult.language}, Text: "${result.text}"`);
                    resolve({
                        detectedLang: autoDetectResult.language,
                        text: result.text
                    });
                } else if (result.reason === sdk.ResultReason.NoMatch) {
                    log(`[SpeechService] NoMatch. Resolving with empty result.`);
                    resolve({ detectedLang: '', text: '' });
                } else if (result.reason === sdk.ResultReason.Canceled) {
                     const cancellation = sdk.CancellationDetails.fromResult(result);
                     log(`[SpeechService] Canceled. Reason: ${cancellation.reason}, ErrorDetails: ${cancellation.errorDetails}`);
                     if (cancellation.reason === sdk.CancellationReason.Error) {
                        reject(new Error(`Auto-detect canceled: ${cancellation.errorDetails}`));
                    } else {
                         reject(new Error("Recognition was aborted."));
                    }
                } else {
                    log(`[SpeechService] Unhandled reason: ${sdk.ResultReason[result.reason]}. Rejecting.`);
                    reject(new Error("No recognized speech"));
                }
            } finally {
                log(`[SpeechService] Closing recognizer.`);
                recognizer.close();
            }
        }, err => {
            log(`[SpeechService] Outer promise error: ${err}`);
            try {
                reject(new Error(`Auto-detect recognition error: ${err}`));
            } finally {
                log(`[SpeechService] Closing recognizer in error handler.`);
                recognizer.close();
            }
        });
    });
}
