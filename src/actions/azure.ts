
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
export async function getAzureVoices(): Promise<VoiceInfo[]> {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
        throw new Error("Azure TTS credentials are not configured on the server.");
    }
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    const result = await synthesizer.getVoicesAsync();
    
    if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
        return result.voices.map(v => ({
            name: v.name,
            displayName: v.displayName,
            localName: v.localName,
            shortName: v.shortName,
            gender: v.gender === sdk.SynthesisVoiceGender.Female ? 'Female' : v.gender === sdk.SynthesisVoiceGender.Male ? 'Male' : 'Neutral',
            locale: v.locale,
            styleList: v.styleList,
        }));
    } else if (result.reason === sdk.ResultReason.Canceled) {
        const cancellation = sdk.VoiceProfileCancellationDetails.fromResult(result);
        throw new Error(`Could not get voices list: ${cancellation.errorDetails}`);
    } else {
        throw new Error(`Failed to retrieve voices list. Reason: ${result.reason}`);
    }
}
