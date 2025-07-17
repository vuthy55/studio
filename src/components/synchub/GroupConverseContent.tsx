
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { languages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';

type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'error';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Helper function to add a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function GroupConverseContent() {
  const [selectedLanguages, setSelectedLanguages] = useState<LanguageCode[]>(['english', 'thai']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);

  const { toast } = useToast();
  
  const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);
  const synthesizerRef = useRef<sdk.SpeechSynthesizer | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const languageToLocaleMap: Record<LanguageCode, string> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
  };

  const stopConversation = useCallback((showToast = true) => {
    if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(() => {
            recognizerRef.current?.close();
            recognizerRef.current = null;
        });
    }
    if (synthesizerRef.current) {
        synthesizerRef.current.close();
        synthesizerRef.current = null;
    }
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
    }
    setStatus('idle');
    setLastSpoken(null);
    if (showToast) {
       toast({ title: 'Conversation Ended', description: 'The live sync session has been stopped.' });
    }
  }, [toast]);
  
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      stopConversation(true);
      toast({ title: "Session Ended", description: "Conversation ended due to inactivity." });
    }, INACTIVITY_TIMEOUT);
  }, [stopConversation, toast]);

  const handleLanguageSelect = (lang: LanguageCode) => {
    if (selectedLanguages.length < 4 && !selectedLanguages.includes(lang)) {
      setSelectedLanguages(prev => [...prev, lang]);
    } else if (selectedLanguages.length >= 4) {
      toast({ variant: 'destructive', title: 'Limit Reached', description: 'You can select a maximum of 4 languages.' });
    }
  };

  const removeLanguage = (langToRemove: LanguageCode) => {
    if (selectedLanguages.length > 2) {
      setSelectedLanguages(prev => prev.filter(lang => lang !== langToRemove));
    } else {
      toast({ variant: 'destructive', title: 'Minimum Required', description: 'You need at least 2 languages for a conversation.' });
    }
  };
  
  const startConversation = async () => {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
        toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
        setStatus('error');
        return;
    }

    setStatus('listening');
    resetInactivityTimer();
    
    try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        
        const autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(
            selectedLanguages.map(l => languageToLocaleMap[l])
        );

        recognizerRef.current = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);
        synthesizerRef.current = new sdk.SpeechSynthesizer(speechConfig, undefined);
        
        recognizerRef.current.recognized = async (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            
            recognizerRef.current?.stopContinuousRecognitionAsync();
            setStatus('speaking');
            
            const result = sdk.AutoDetectSourceLanguageResult.fromResult(e.result);
            const detectedLangLocale = result.language;
            const originalText = e.result.text;
            
            const detectedLangCode = Object.keys(languageToLocaleMap).find(key => languageToLocaleMap[key as LanguageCode] === detectedLangLocale) as LanguageCode | undefined;
            
            if (!detectedLangCode) {
                // If language is not one of the selected, just restart listening
                setStatus('listening');
                resetInactivityTimer();
                recognizerRef.current?.startContinuousRecognitionAsync();
                return;
            }

            const fromLangLabel = languages.find(l => l.value === detectedLangCode)?.label || 'Unknown';
            setLastSpoken({ lang: fromLangLabel, text: originalText });
            
            const targetLanguages = selectedLanguages.filter(l => l !== detectedLangCode);
            
            for (const targetLang of targetLanguages) {
                const toLangLabel = languages.find(l => l.value === targetLang)?.label || targetLang;
                
                // 1. Translate the text
                const translationResult = await translateText({
                    text: originalText,
                    fromLanguage: fromLangLabel,
                    toLanguage: toLangLabel,
                });
                const translatedText = translationResult.translatedText;

                // 2. Synthesize the translated text
                const targetLocale = languageToLocaleMap[targetLang];
                if (synthesizerRef.current) {
                  const synthesisConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
                  synthesisConfig.speechSynthesisLanguage = targetLocale;
                  const synthesizer = new sdk.SpeechSynthesizer(synthesisConfig);

                  await new Promise<void>((resolve, reject) => {
                    synthesizer.speakTextAsync(translatedText, 
                      (result) => {
                        synthesizer.close();
                        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                          resolve();
                        } else {
                          reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
                        }
                      },
                      (err) => {
                         synthesizer.close();
                         reject(err);
                      });
                  });
                   // Add a delay between languages
                  await sleep(2000);
                }
            }

            setStatus('listening');
            resetInactivityTimer();
            recognizerRef.current?.startContinuousRecognitionAsync();
          }
        };

        recognizerRef.current.canceled = (s, e) => {
            console.error(`CANCELED: Reason=${e.reason}`);
            if (e.reason === sdk.CancellationReason.Error) {
                toast({ variant: 'destructive', title: 'Recognition Error', description: e.errorDetails });
                stopConversation(false);
            }
        };

        recognizerRef.current.sessionStopped = (s, e) => {
             if (status !== 'idle') {
                stopConversation(false);
             }
        };

        recognizerRef.current.startContinuousRecognitionAsync();

    } catch (error: any) {
        console.error("Error starting conversation:", error);
        toast({ variant: "destructive", title: "Error", description: `Failed to start session: ${error.message}` });
        setStatus('error');
    }
  };

  const toggleConversation = () => {
    if (status === 'idle' || status === 'error') {
      startConversation();
    } else {
      stopConversation();
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation(false);
    };
  }, [stopConversation]);

  const languageOptions = languages.filter(l => !selectedLanguages.includes(l.value));

  return (
    <Card className="shadow-lg mt-6 w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
                <Users className="h-7 w-7 text-primary"/>
                Group Conversation
            </CardTitle>
            <CardDescription>
                Place your phone on the table. The mic will listen continuously and speak translations for the group.
            </CardDescription>
        </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="w-full space-y-4">
            <Label className="flex items-center gap-2 font-semibold"><Languages className="h-5 w-5"/> Conversation Languages ({selectedLanguages.length}/4)</Label>
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border bg-muted min-h-[4rem]">
                {selectedLanguages.map(lang => (
                    <Badge key={lang} variant="secondary" className="text-base py-1 px-3">
                        {languages.find(l => l.value === lang)?.label}
                        <button onClick={() => removeLanguage(lang)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5">
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                {selectedLanguages.length < 4 && (
                     <Select onValueChange={(val) => handleLanguageSelect(val as LanguageCode)}>
                        <SelectTrigger className="w-40 h-9 border-dashed">
                            <SelectValue placeholder="Add language..." />
                        </SelectTrigger>
                        <SelectContent>
                           {languageOptions.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
        </div>

        <Button
          size="lg"
          className={cn(
              "rounded-full w-32 h-32 text-lg transition-all duration-300 ease-in-out",
              status === 'listening' && 'bg-green-500 hover:bg-green-600 animate-[pulse_10s_cubic-bezier(0.4,0,0.6,1)_infinite]',
              status === 'speaking' && 'bg-blue-500 hover:bg-blue-600',
              (status === 'idle' || status === 'error') && 'bg-primary hover:bg-primary/90'
          )}
          onClick={toggleConversation}
        >
          {status === 'idle' && <><Mic className="h-10 w-10 mr-2"/> Start</>}
          {status === 'listening' && <LoaderCircle className="h-12 w-12 animate-spin" />}
          {status === 'speaking' && <Volume2 className="h-12 w-12" />}
          {status === 'error' && <><Mic className="h-10 w-10 mr-2"/> Retry</>}
          {status !== 'idle' && status !== 'error' && (
              <span className="absolute bottom-5 text-sm font-normal">Tap to Stop</span>
          )}
        </Button>

        <div className="text-center h-16">
            <p className="font-semibold text-muted-foreground">
                {status === 'idle' && "Press Start to begin"}
                {status === 'listening' && "Listening..."}
                {status === 'speaking' && "Speaking..."}
                {status === 'error' && "An error occurred. Please try again."}
            </p>
            {lastSpoken && status !== 'idle' && (
                 <p className="text-sm text-foreground mt-1 truncate max-w-md">
                     <span className="font-bold">{lastSpoken.lang}:</span> "{lastSpoken.text}"
                 </p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
