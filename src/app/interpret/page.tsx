
'use client';

import { useState, useEffect, useRef } from 'react';
import { languages, LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, ArrowRightLeft, Languages, Volume2, Power } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { generateSpeech } from '@/ai/flows/tts-flow';
import { translateText } from '@/app/actions';
import { Badge } from '@/components/ui/badge';

type ConversationEntry = {
  id: number;
  originalText: string;
  translatedText: string;
  from: LanguageCode;
  to: LanguageCode;
};

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
  english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
  malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
  chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

export default function InterpretPage() {
    const [lang1, setLang1] = useState<LanguageCode>('english');
    const [lang2, setLang2] = useState<LanguageCode>('thai');
    const { toast } = useToast();
    const [isListening, setIsListening] = useState(false);
    const [lastMessage, setLastMessage] = useState<string>('');
    const [conversation, setConversation] = useState<ConversationEntry[]>([]);
    
    const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    const stopRecognition = () => {
        if (recognizerRef.current) {
            try {
                recognizerRef.current.stopContinuousRecognitionAsync(
                    () => {
                        // This will trigger sessionStopped event which handles cleanup.
                    },
                    (err) => {
                        console.error("Error stopping recognition: ", err);
                        // Force cleanup if stop fails
                        setIsListening(false);
                    }
                );
            } catch(e) {
                console.warn("Could not stop recognizer, it might have already stopped.", e);
                setIsListening(false);
            }
        } else {
             setIsListening(false);
        }
    };
    
    useEffect(() => {
        // Cleanup on component unmount
        return () => {
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
        };
    }, []);

    const handleStartStop = () => {
        if (isListening) {
            stopRecognition();
            return;
        }

        const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
        const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
        if (!azureKey || !azureRegion) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
            return;
        }

        const locale1 = languageToLocaleMap[lang1];
        const locale2 = languageToLocaleMap[lang2];
        if (!locale1 || !locale2) {
            toast({ variant: 'destructive', title: 'Unsupported Language' });
            return;
        }

        setIsListening(true);
        setLastMessage('Starting session... Press Start to begin');
        
        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "2000");

        const autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages([locale1, locale2]);
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);
        recognizerRef.current = recognizer;

        recognizer.recognizing = (s, e) => {
            setLastMessage(`Listening... ${e.result.text ? `(${e.result.text})` : ''}`);
        };

        recognizer.recognized = async (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(e.result);
                const detectedLocale = autoDetectResult.language;
                const recognizedText = e.result.text;
                
                if (!recognizedText || !detectedLocale) {
                    setLastMessage(`Could not recognize speech clearly.`);
                    return;
                }

                setLastMessage(`Recognized: ${recognizedText}`);
                
                let sourceLang: LanguageCode, targetLang: LanguageCode, targetLocale: string;
                
                if (detectedLocale === locale1) {
                    sourceLang = lang1;
                    targetLang = lang2;
                    targetLocale = locale2;
                } else if (detectedLocale === locale2) {
                    sourceLang = lang2;
                    targetLang = lang1;
                    targetLocale = locale1;
                } else {
                    setLastMessage(`Could not detect a supported language.`);
                    return;
                }
                
                try {
                    setLastMessage('Translating...');
                    const fromLangLabel = languages.find(l => l.value === sourceLang)?.label || sourceLang;
                    const toLangLabel = languages.find(l => l.value === targetLang)?.label || targetLang;

                    const translationResult = await translateText({
                        text: recognizedText,
                        fromLanguage: fromLangLabel,
                        toLanguage: toLangLabel,
                    });

                    if (translationResult.error || !translationResult.translatedText) {
                        throw new Error(translationResult.error || 'Translation failed');
                    }
                    
                    const newEntry: ConversationEntry = {
                        id: Date.now(),
                        originalText: recognizedText,
                        translatedText: translationResult.translatedText,
                        from: sourceLang,
                        to: targetLang,
                    };
                    setConversation(prev => [newEntry, ...prev]);
                    setLastMessage('Speaking...');
                    
                    const response = await generateSpeech({
                        text: translationResult.translatedText,
                        lang: targetLocale,
                    });
                    
                    if (audioPlayerRef.current) {
                        audioPlayerRef.current.src = response.audioDataUri;
                        await audioPlayerRef.current.play();
                    }
                    
                    setLastMessage('Listening...');

                } catch (error) {
                    console.error("Translation/TTS error:", error);
                    toast({ variant: 'destructive', title: 'Error', description: 'Failed to process speech.' });
                    setLastMessage('Error. Ready to listen again.');
                }
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                setLastMessage('Could not understand speech.');
            }
        };

        recognizer.canceled = (s, e) => {
            console.log(`CANCELED: Reason=${e.reason}. ErrorDetails=${e.errorDetails}`);
            setLastMessage(`Session canceled. Reason: ${e.reason}`);
            setIsListening(false);
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
        };
        
        recognizer.sessionStopped = (s, e) => {
            setIsListening(false);
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
            setLastMessage('Session ended.');
        };

        recognizer.startContinuousRecognitionAsync();
    };

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold font-headline">Interpreter Mode</h1>
                <p className="text-muted-foreground">Have a face-to-face conversation with translation.</p>
            </header>

            <Card className="shadow-lg">
                <CardContent className="space-y-6 pt-6">
                    <div className="flex flex-col sm:flex-row items-center gap-2 md:gap-4">
                        <div className="flex-1 w-full">
                            <Label htmlFor="lang-1">Language 1</Label>
                            <Select value={lang1} onValueChange={(v) => setLang1(v as LanguageCode)} disabled={isListening}>
                                <SelectTrigger id="lang-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground mt-5 shrink-0" />
                        <div className="flex-1 w-full">
                            <Label htmlFor="lang-2">Language 2</Label>
                            <Select value={lang2} onValueChange={(v) => setLang2(v as LanguageCode)} disabled={isListening}>
                                <SelectTrigger id="lang-2"><SelectValue /></SelectTrigger>
                                <SelectContent>{languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center space-y-4 pt-8">
                        <Button 
                            onClick={handleStartStop}
                            className={cn(
                                "rounded-full h-32 w-32 text-white transition-all duration-300 transform hover:scale-105 shadow-lg flex flex-col items-center justify-center gap-2",
                                isListening ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
                            )}
                        >
                           {isListening ? <Power className="h-12 w-12" /> : <Mic className="h-12 w-12" />}
                           <span className="text-lg font-semibold">{isListening ? 'Stop' : 'Start'}</span>
                        </Button>
                        <p className="h-6 text-muted-foreground animate-pulse">{isListening ? lastMessage : "Press Start to begin"}</p>
                    </div>

                    <div className="space-y-4 pt-4 max-h-[40vh] overflow-y-auto pr-4">
                       {conversation.map(entry => (
                         <div key={entry.id} className="p-4 rounded-lg border bg-secondary/30">
                            <div className="flex justify-between items-center mb-2">
                                <Badge variant="secondary">{languages.find(l=>l.value === entry.from)?.label}</Badge>
                                 <Button size="icon" variant="ghost" onClick={async () => {
                                      const audio = new Audio();
                                      try {
                                        const res = await generateSpeech({ text: entry.originalText, lang: languageToLocaleMap[entry.from]! });
                                        audio.src = res.audioDataUri;
                                        audio.play();
                                      } catch(e) {
                                        console.error(e);
                                        toast({ variant: 'destructive', title: 'Audio Error', description: 'Could not play audio.' });
                                      }
                                  }}>
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="mb-3">{entry.originalText}</p>
                            <div className="border-t border-dashed border-border my-2"></div>
                            <div className="flex justify-between items-center mb-2">
                                <Badge variant="default">{languages.find(l=>l.value === entry.to)?.label}</Badge>
                                 <Button size="icon" variant="ghost" onClick={async () => {
                                       const audio = new Audio();
                                       try {
                                        const res = await generateSpeech({ text: entry.translatedText, lang: languageToLocaleMap[entry.to]! });
                                        audio.src = res.audioDataUri;
                                        audio.play();
                                       } catch (e) {
                                        console.error(e);
                                        toast({ variant: 'destructive', title: 'Audio Error', description: 'Could not play audio.' });
                                       }
                                  }}>
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="font-semibold text-primary">{entry.translatedText}</p>
                         </div>
                       ))}
                    </div>
                     <audio ref={audioPlayerRef} className="hidden" />
                </CardContent>
            </Card>
        </div>
    );
}
