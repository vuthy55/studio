
'use server';

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { LanguageCode } from '@/lib/data';

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

interface RecognizeOnceInput {
    lang: LanguageCode;
}

interface RecognizeOnceOutput {
    text?: string;
    error?: string;
}

/**
 * A dedicated, isolated server action to perform a single speech recognition event.
 * It does not interact with any shared state.
 */
export async function recognizeOnce(input: RecognizeOnceInput): Promise<RecognizeOnceOutput> {
    const locale = languageToLocaleMap[input.lang];
    if (!locale) {
        return { error: `Unsupported language for recognition: ${input.lang}` };
    }
    
    const speechConfig = getSpeechConfig();
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    speechConfig.speechRecognitionLanguage = locale;
    
    let recognizer: sdk.SpeechRecognizer | undefined;

    return new Promise<RecognizeOnceOutput>((resolve) => {
        try {
            recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            recognizer.recognizeOnceAsync(result => {
                if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                    resolve({ text: result.text });
                } else if (result.reason === sdk.ResultReason.NoMatch) {
                    resolve({ error: "Could not recognize speech. Please try again." });
                } else if (result.reason === sdk.ResultReason.Canceled) {
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    let errorMessage = `Recognition canceled: ${cancellation.errorDetails}`;
                    if (cancellation.errorCode === sdk.CancellationErrorCode.PermissionDenied) {
                        errorMessage = "Recognition failed: Microphone permissions may not be granted.";
                    }
                     resolve({ error: errorMessage });
                } else {
                    resolve({ error: `Could not recognize speech. Reason: ${result.reason}` });
                }
                 if(recognizer) recognizer.close();

            }, err => {
                resolve({ error: `Recognition error: ${err}` });
                 if(recognizer) recognizer.close();
            });
        } catch (error: any) {
             resolve({ error: error.message || 'An unexpected error occurred.' });
             if(recognizer) recognizer.close();
        }
    });
}
