
'use server';

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface VoiceInfo {
    name: string;
    displayName: string;
    localName: string;
    shortName: string;
    gender: 'Male' | 'Female' | 'Neutral';
    locale: string;
    styleList: string[];
}

/**
 * Fetches the list of available TTS voices from the Azure Speech service.
 * This is a server-side action to protect credentials if they were not public.
 */
export async function getAzureVoices(): Promise<{ voices?: VoiceInfo[], error?: string }> {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
        return { error: "Azure TTS credentials are not configured on the server." };
    }
    
    // This recognizer is created only to access the getVoicesAsync method.
    // It's a slight misuse of the SDK's intent but is the standard way to get the voice list.
    const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    try {
        const result = await synthesizer.getVoicesAsync();
    
        if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
            const voices: VoiceInfo[] = result.voices.map(v => {
                let gender: 'Male' | 'Female' | 'Neutral' = 'Neutral';
                if (v.gender === sdk.SynthesisVoiceGender.Female) {
                    gender = 'Female';
                } else if (v.gender === sdk.SynthesisVoiceGender.Male) {
                    gender = 'Male';
                }
                
                return {
                    name: v.name,
                    displayName: v.displayName,
                    localName: v.localName,
                    shortName: v.shortName,
                    gender: gender,
                    locale: v.locale,
                    styleList: v.styleList,
                };
            });
            return { voices };
        } else if (result.reason === sdk.ResultReason.Canceled) {
            // For a SynthesisVoicesResult, the error details are directly on the result object.
            return { error: `Could not get voices list: ${result.errorDetails}` };
        } else {
            return { error: `Failed to retrieve voices list. Reason: ${result.reason}` };
        }
    } catch (error: any) {
        console.error("[getAzureVoices] Error:", error);
        return { error: error.message || 'An unknown error occurred while fetching voices.' };
    } finally {
        // Ensure the synthesizer is closed to release resources.
        synthesizer.close();
    }
}
