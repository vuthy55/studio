
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
    
    private isContinuousListening: boolean = false;

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
        if (typeof window === 'undefined') {
            throw new Error("Microphone access is only available in the browser.");
        }
        if (!this.audioConfig) {
            this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        }
        return this.audioConfig;
    }
    
    private getRecognizer(languageConfig: sdk.AutoDetectSourceLanguageConfig | string): sdk.SpeechRecognizer {
        // If we are performing continuous recognition, we don't want to create a new recognizer
        if (this.isContinuousListening && this.recognizer) {
            return this.recognizer;
        }

        this.closeRecognizer(); // Close any existing recognizer before creating a new one

        const speechConfig = this.getSpeechConfig();
        const audioConfig = this.getAudioConfig();
        
        if (typeof languageConfig === 'string') {
            speechConfig.speechRecognitionLanguage = languageConfig;
            this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        } else {
            this.recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, languageConfig, audioConfig);
        }

        return this.recognizer;
    }

    public recognizeOnce(locale: string): Promise<string> {
        this.isContinuousListening = false;
        const recognizer = this.getRecognizer(locale);

        return new Promise<string>((resolve, reject) => {
            recognizer.recognizeOnceAsync(result => {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    resolve(result.text);
                } else {
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    reject(new Error(`Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}. Details: ${cancellation.errorDetails || 'No details'}`));
                }
                 this.closeRecognizer();
            }, err => {
                reject(new Error(`Recognition error: ${err}`));
                this.closeRecognizer();
            });
        });
    }

    public recognizeWithAutoDetect(languages: AzureLanguageCode[]): Promise<{ detectedLang: string, text: string }> {
        this.isContinuousListening = false;
        const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages);
        const recognizer = this.getRecognizer(autoDetectConfig);
        
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
                this.closeRecognizer();
            }, err => {
                reject(new Error(`Auto-detect recognition error: ${err}`));
                this.closeRecognizer();
            });
        });
    }
    
    public assessPronunciation(referenceText: string, locale: string): Promise<PronunciationAssessmentResult> {
        this.isContinuousListening = false;
        const recognizer = this.getRecognizer(locale);

        const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
            referenceText,
            sdk.PronunciationAssessmentGradingSystem.HundredMark,
            sdk.PronunciationAssessmentGranularity.Phoneme,
            true
        );
        pronunciationConfig.applyTo(recognizer);

        return new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(result => {
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
                     const cancellation = sdk.CancellationDetails.fromResult(result);
                     reject(new Error(`Recognition failed: ${cancellation.errorDetails || sdk.ResultReason[result.reason]}`));
                }
                this.closeRecognizer();
            }, err => {
                 reject(new Error(`Assessment error: ${err}`));
                 this.closeRecognizer();
            });
        });
    }

    public getContinuousRecognizer(language: string, recognizedCallback: (text: string) => void, errorCallback: (errorDetails: string) => void, stoppedCallback: () => void): sdk.SpeechRecognizer {
        this.isContinuousListening = true;
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

    public abortRecognition() {
        if (this.recognizer) {
            this.recognizer.stopContinuousRecognitionAsync(() => {}, (err) => {});
            this.closeRecognizer();
        }
    }
    
    private closeRecognizer() {
        if (this.recognizer) {
            this.recognizer.close();
            this.recognizer = null;
        }
        if (this.audioConfig) {
            this.audioConfig.close();
            this.audioConfig = null;
        }
        this.isContinuousListening = false;
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

export function abortRecognition() {
    speechService.abortRecognition();
}
