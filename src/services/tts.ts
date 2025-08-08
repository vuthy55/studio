
"use client";

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface GenerateSpeechInput {
  text: string;
  lang: string;
  voice?: 'default' | 'male' | 'female';
}

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

export interface GenerateSpeechOutput {
  audioDataUri: string;
}

export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechOutput> {
  const { text, lang, voice } = input;
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.NEXT_PUBLIC_AZURE_TTS_KEY!,
    process.env.NEXT_PUBLIC_AZURE_TTS_REGION!
  );
  speechConfig.speechSynthesisLanguage = lang;

  const voiceMap: Record<string, { male: string, female: string }> = {
    'th-TH': { male: 'th-TH-NiwatNeural', female: 'th-TH-PremwadeeNeural' },
    'vi-VN': { male: 'vi-VN-NamMinhNeural', female: 'vi-VN-HoaiMyNeural' },
    'km-KH': { male: 'km-KH-PisethNeural', female: 'km-KH-SreymomNeural' },
    'fil-PH': { male: 'fil-PH-AngeloNeural', female: 'fil-PH-BlessicaNeural' },
    'ms-MY': { male: 'ms-MY-OsmanNeural', female: 'ms-MY-YasminNeural' },
    'id-ID': { male: 'id-ID-ArdiNeural', female: 'id-ID-GadisNeural' },
    'my-MM': { male: 'my-MM-ThihaNeural', female: 'my-MM-NilarNeural' },
    'lo-LA': { male: 'lo-LA-ChanthavongNeural', female: 'lo-LA-KeomanyNeural' },
    'ta-IN': { male: 'ta-IN-PallaviNeural', female: 'ta-IN-ValluvarNeural' },
    'zh-CN': { male: 'zh-CN-YunxiNeural', female: 'zh-CN-XiaoxiaoNeural' },
    'fr-FR': { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
    'es-ES': { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
    'it-IT': { male: 'it-IT-DiegoNeural', female: 'it-IT-ElsaNeural' },
    'en-US': { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' },
  };
  
  if (voice && voice !== 'default' && voiceMap[lang]) {
    speechConfig.speechSynthesisVoiceName = voiceMap[lang][voice];
  }

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

  const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(result.audioData);
        } else {
          reject(new Error(`Speech synthesis canceled, ${result.errorDetails} [${result.reason}]`));
        }
      },
      (err) => {
        synthesizer.close();
        reject(err);
      }
    );
  });

  const base64Audio = Buffer.from(audioData).toString('base64');
  return {
    audioDataUri: `data:audio/wav;base64,${base64Audio}`,
  };
}
