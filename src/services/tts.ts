
'use server';

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface GenerateSpeechInput {
  text: string;
  lang: string;
  voice?: 'default' | 'male' | 'female';
}

export interface GenerateSpeechOutput {
  audioDataUri: string;
}

export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechOutput> {
  const { text, lang, voice } = input;
  const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY!;
  const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION!;
  
  const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  
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

  const selectedVoiceName = (voice && voice !== 'default' && voiceMap[lang]) ? voiceMap[lang][voice] : (voiceMap[lang]?.female || 'en-US-JennyNeural');

  // Escape all 5 special XML characters to ensure valid SSML.
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const ssml = `
    <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>
        <voice name='${selectedVoiceName}'>
            <prosody rate='-15.00%'>
                ${escapedText}
            </prosody>
        </voice>
    </speak>
  `;

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

  const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
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
