"use client";

import { useState, useEffect } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, XCircle, LoaderCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { generateSpeech } from '@/services/tts';
// import { translateText } from '@/ai/flows/translation-flow';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { useLanguage } from '@/context/LanguageContext';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

export default function LiveTranslationContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>('default');

    const [isRecognizing, setIsRecognizing] = useState(false);
    const [isAssessing, setIsAssessing] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);

    const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
        english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
        malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
        chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
    };

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || isRecognizing || isAssessing) return;
        const locale = languageToLocaleMap[lang];
        
        try {
            const response = await generateSpeech({ text, lang: locale || 'en-US', voice: selectedVoice });
            const audio = new Audio(response.audioDataUri);
            audio.play().catch(e => console.error("Audio playback failed.", e));
        } catch (error) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Error generating audio',
                description: 'Could not generate audio for the selected language. Credentials might be missing.',
            });
        }
    };
    
    const handleTranslation = async () => {
        if (!inputText) return;
        setIsTranslating(true);
        setAssessmentResult(null);
        // try {
        //     const fromLangLabel = languages.find(l => l.value === fromLanguage)?.label || fromLanguage;
        //     const toLangLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
        //     const result = await translateText({ text: inputText, fromLanguage: fromLangLabel, toLanguage: toLangLabel });
        //     setTranslatedText(result.translatedText);
        // } catch (error) {
        //     console.error('Translation failed', error);
        //     toast({
        //         variant: 'destructive',
        //         title: 'Translation Error',
        //         description: 'Could not translate the text.',
        //     });
        // } finally {
        //     setIsTranslating(false);
        // }
    };

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (inputText) {
                // handleTranslation();
            } else {
                setTranslatedText('');
                setAssessmentResult(null);
            }
        }, 500);

        return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputText, fromLanguage, toLanguage]);

    const recognizeFromMicrophone = async () => {
        const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
        const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    
        if (!azureKey || !azureRegion) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured for speech recognition.' });
            return;
        }

        const locale = languageToLocaleMap[fromLanguage];
        if (!locale) {
            toast({ variant: 'destructive', title: 'Unsupported Language' });
            return;
        }

        setIsRecognizing(true);
        let recognizer: sdk.SpeechRecognizer | undefined;

        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = locale;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer!.recognizeOnceAsync(resolve, reject);
            });

            if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                setInputText(result.text);
            } else {
                 toast({ variant: 'destructive', title: 'Recognition Failed', description: `Could not recognize speech. Please try again. Reason: ${sdk.ResultReason[result.reason]}` });
            }
        } catch (error) {
            console.error("Error during speech recognition:", error);
            toast({ variant: 'destructive', title: 'Recognition Error', description: `An unexpected error occurred during speech recognition.` });
        } finally {
            if (recognizer) {
                recognizer.close();
            }
            setIsRecognizing(false);
        }
    }

   const assessPronunciation = async (referenceText: string, lang: LanguageCode) => {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
      toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
      return;
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) {
      toast({ variant: 'destructive', title: 'Unsupported Language' });
      return;
    }
    
    setIsAssessing(true);

    let recognizer: sdk.SpeechRecognizer | undefined;
    let finalResult: AssessmentResult = { status: 'fail', accuracy: 0, fluency: 0 };
    
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
      speechConfig.speechRecognitionLanguage = locale;
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      
      const pronunciationConfigJson = JSON.stringify({
          referenceText: `${referenceText}.`,
          gradingSystem: "HundredMark",
          granularity: "Phoneme",
          enableMiscue: true,
      });

      const pronunciationConfig = sdk.PronunciationAssessmentConfig.fromJSON(pronunciationConfigJson);
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      pronunciationConfig.applyTo(recognizer);

      const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
        recognizer!.recognizeOnceAsync(resolve, reject);
      });
      
      if (result && result.reason === sdk.ResultReason.RecognizedSpeech) {
        const jsonString = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        
        if (jsonString) {
          const parsedResult = JSON.parse(jsonString);
          const assessment = parsedResult.NBest?.[0]?.PronunciationAssessment;

          if (assessment) {
            const accuracyScore = assessment.AccuracyScore;
            const fluencyScore = assessment.FluencyScore;
            finalResult = {
              status: accuracyScore > 70 ? 'pass' : 'fail',
              accuracy: accuracyScore,
              fluency: fluencyScore,
            };
          }
        }
      } else {
        toast({ variant: 'destructive', title: 'Assessment Failed', description: `Could not assess pronunciation. Please try again.` });
        finalResult.status = 'fail';
      }
    } catch (error) {
      console.error("Error during assessment:", error);
      finalResult.status = 'fail';
      toast({ variant: 'destructive', title: 'Assessment Error', description: `An unexpected error occurred.` });
    } finally {
      if (recognizer) {
        recognizer.close();
      }
      setAssessmentResult(finalResult);
      setIsAssessing(false);
    }
  };

    return (
        <Card className="shadow-lg mt-6">
            <CardContent className="space-y-6 pt-6">
                 <div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-4 mb-6">
                    <div className="flex-1 w-full">
                        <Label htmlFor="from-language-select-live">From</Label>
                        <Select value={fromLanguage} onValueChange={(value) => setFromLanguage(value as LanguageCode)}>
                            <SelectTrigger id="from-language-select-live">
                                <SelectValue placeholder="Select a language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map(lang => (
                                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button variant="ghost" size="icon" className="self-end" onClick={swapLanguages}>
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                        <span className="sr-only">Switch languages</span>
                    </Button>
                    
                    <div className="flex-1 w-full">
                        <Label htmlFor="to-language-select-live">To</Label>
                        <Select value={toLanguage} onValueChange={(value) => setToLanguage(value as LanguageCode)}>
                            <SelectTrigger id="to-language-select-live">
                                <SelectValue placeholder="Select a language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map(lang => (
                                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                     <div className="w-full sm:w-auto sm:flex-1">
                      <Label htmlFor="tts-voice-live">Voice</Label>
                      <Select value={selectedVoice} onValueChange={(value) => setSelectedVoice(value as VoiceSelection)}>
                          <SelectTrigger id="tts-voice-live">
                              <SelectValue placeholder="Select a voice" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="default">Default</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                      </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* From Language Section */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="from-language-live">
                                {languages.find(l => l.value === fromLanguage)?.label}
                            </Label>
                            <Button size="icon" variant="ghost" onClick={recognizeFromMicrophone} disabled={isRecognizing || isAssessing}>
                                {isRecognizing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                <span className="sr-only">Record from microphone</span>
                            </Button>
                        </div>
                        <Textarea
                            id="from-language-live"
                            placeholder="Type or speak..."
                            className="h-36 resize-none"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />
                    </div>
                    
                    {/* To Language Section */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                           <Label htmlFor="to-language-live">
                                {languages.find(l => l.value === toLanguage)?.label}
                           </Label>
                           <div className="flex items-center">
                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translatedText, toLanguage)} disabled={!translatedText || isAssessing}>
                                    <Volume2 className="h-5 w-5" />
                                    <span className="sr-only">Play translated audio</span>
                                </Button>
                                 <Button size="icon" variant="ghost" onClick={() => assessPronunciation(translatedText, toLanguage)} disabled={!translatedText || isAssessing}>
                                    {isAssessing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                    <span className="sr-only">Assess pronunciation</span>
                                </Button>
                           </div>
                        </div>
                        <div className="h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-base relative">
                            {isTranslating && <LoaderCircle className="absolute top-3 right-3 h-5 w-5 animate-spin text-muted-foreground" />}
                            <p>{translatedText}</p>
                             {assessmentResult && (
                                <div className="absolute bottom-2 left-3 text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                    {assessmentResult.status === 'pass' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                    {assessmentResult.status === 'fail' && <XCircle className="h-4 w-4 text-red-500" />}
                                    <p>Accuracy: <span className="font-bold">{assessmentResult.accuracy?.toFixed(0) ?? 'N/A'}%</span> | Fluency: <span className="font-bold">{assessmentResult.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}