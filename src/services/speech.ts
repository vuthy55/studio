
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';
import type { AzureLanguageCode } from '@/lib/azure-languages';

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

class SpeechService {
    private speechConfig: sdk.SpeechConfig | null = null;
    private audioConfig: sdk.AudioConfig | null = null;
    private recognizer: sdk.SpeechRecognizer | null = null;

    private getSpeechConfig(): sdk.SpeechConfig {
        if (!this.speechConfig) {
            const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
            const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
            if (!azureKey || !azureRegion) {
                throw new Error("Azure credentials are not configured in your .env file.");
            }
            this.speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        }
        return this.speechConfig;
    }

    private getAudioConfig(): sdk.AudioConfig {
        if (!this.audioConfig) {
             if (typeof window === 'undefined') {
                throw new Error("Microphone access is only available in the browser.");
            }
            this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        }
        return this.audioConfig;
    }
    
    private getRecognizer(languageConfig: sdk.AutoDetectSourceLanguageConfig | string): sdk.SpeechRecognizer {
        const speechConfig = this.getSpeechConfig();
        const audioConfig = this.getAudioConfig();
        
        if (this.recognizer) {
            this.recognizer.close();
        }

        if (typeof languageConfig === 'string') {
            speechConfig.speechRecognitionLanguage = languageConfig;
            this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        } else {
            this.recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, languageConfig, audioConfig);
        }

        return this.recognizer;
    }

    public async recognizeOnce(locale: string): Promise<string> {
        const recognizer = this.getRecognizer(locale);
        try {
            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer.recognizeOnceAsync(resolve, reject);
            });

            if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                return result.text;
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                throw new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}. Details: ${cancellation.errorDetails}`);
            }
        } finally {
            // We don't close the recognizer here to allow reuse,
            // the getRecognizer method will handle closing old ones.
        }
    }

    public async recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
        const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
        const recognizer = this.getRecognizer(autoDetectConfig);
        try {
            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer.recognizeOnceAsync(resolve, reject);
            });

            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                return {
                    detectedLang: autoDetectResult.language,
                    text: result.text
                };
            } else {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                throw new Error(cancellation.errorDetails || "No speech could be recognized.");
            }
        } finally {
             // We don't close the recognizer here to allow reuse
        }
    }
    
    public async assessPronunciation(referenceText: string, locale: string): Promise<PronunciationAssessmentResult> {
        const recognizer = this.getRecognizer(locale);
        const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
            referenceText,
            sdk.PronunciationAssessmentGradingSystem.HundredMark,
            sdk.PronunciationAssessmentGranularity.Phoneme,
            true
        );
        pronunciationConfig.applyTo(recognizer);

        try {
            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer.recognizeOnceAsync(resolve, reject);
            });

            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
                const accuracyScore = assessment.accuracyScore;
                return {
                    accuracy: accuracyScore,
                    fluency: assessment.fluencyScore,
                    completeness: assessment.completenessScore,
                    pronScore: assessment.pronunciationScore,
                    isPass: accuracyScore > 70
                };
            } else {
                 const cancellation = sdk.CancellationDetails.fromResult(result);
                 throw new Error(`Recognition failed: ${cancellation.errorDetails || sdk.ResultReason[result.reason]}`);
            }
        } finally {
            // We don't close the recognizer here to allow reuse
        }
    }

    public getContinuousRecognizer(language: string, recognizedCallback: (text: string) => void, errorCallback: (errorDetails: string) => void, stoppedCallback: () => void): sdk.SpeechRecognizer {
        const recognizer = this.getRecognizer(language);

        recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
                recognizedCallback(e.result.text);
            }
        };

        recognizer.canceled = (s, e) => {
            if (e.reason === sdk.CancellationReason.Error) {
                errorCallback(e.errorDetails);
            }
            stoppedCallback();
        };

        recognizer.sessionStopped = (s, e) => {
            stoppedCallback();
        };
        
        return recognizer;
    }
}

// Export a single instance of the service
const speechService = new SpeechService();


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
    return speechService.recognizeOnce(locale);
}

export async function assessPronunciationFromMic(referenceText: string, lang: LanguageCode): Promise<PronunciationAssessmentResult> {
    const locale = languageToLocaleMap[lang];
    if (!locale) throw new Error("Unsupported language for assessment.");
    return speechService.assessPronunciation(referenceText, locale);
}

export async function recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
    return speechService.recognizeWithAutoDetect(languages);
}

export function getContinuousRecognizerForRoom(
    language: string,
    recognizedCallback: (text: string) => void,
    errorCallback: (errorDetails: string) => void,
    stoppedCallback: () => void
): sdk.SpeechRecognizer {
    return speechService.getContinuousRecognizer(language, recognizedCallback, errorCallback, stoppedCallback);
}
