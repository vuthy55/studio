
"use client";

import { useState, useEffect, useRef } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Volume2, Bot, User, LoaderCircle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { generateSpeech } from '@/services/tts';
import { converse } from '@/services/converse';
import { useLanguage } from '@/context/LanguageContext';

type Message = {
  role: 'user' | 'model';
  content: string;
};

export default function ConversePageContent() {
  const { toLanguage, setToLanguage } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
      english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
      malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
      chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
  };

  const handlePlayAudio = async (text: string, lang: LanguageCode) => {
      if (!text || isPlayingAudio || isRecognizing || isReplying) return;
      setIsPlayingAudio(true);
      const locale = languageToLocaleMap[lang];
      
      try {
          const response = await generateSpeech({ text, lang: locale || 'en-US' });
          const audio = new Audio(response.audioDataUri);
          await audio.play();
      } catch (error) {
          console.error("TTS generation failed.", error);
          toast({
              variant: 'destructive',
              title: 'Error generating audio',
              description: 'Could not generate audio for the selected language.',
          });
      } finally {
        setIsPlayingAudio(false);
      }
  };

  const recognizeFromMicrophone = async () => {
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
        toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
        return;
    }
    
    const locale = languageToLocaleMap[toLanguage];
    if (!locale) {
        toast({ variant: 'destructive', title: 'Unsupported Language' });
        return;
    }

    setIsRecognizing(true);
    let recognizer: any; // Using `any` to avoid full SDK type import in this component

    try {
        const sdk = await import('microsoft-cognitiveservices-speech-sdk');
        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        speechConfig.speechRecognitionLanguage = locale;
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        const result: any = await new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(resolve, reject);
        });

        if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
            const userMessage: Message = { role: 'user', content: result.text };
            setMessages(prev => [...prev, userMessage]);
            await handleConversation(result.text, [...messages, userMessage]);
        } else {
             toast({ variant: 'destructive', title: 'Recognition Failed', description: `Could not recognize speech. Please try again.` });
        }
    } catch (error) {
        console.error("Error during speech recognition:", error);
        toast({ variant: 'destructive', title: 'Recognition Error', description: `An unexpected error occurred.` });
    } finally {
        if (recognizer) {
            recognizer.close();
        }
        setIsRecognizing(false);
    }
  }

  const handleConversation = async (userMessage: string, currentHistory: Message[]) => {
      setIsReplying(true);
      try {
          const languageLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
          
          const result = await converse({
              history: currentHistory.slice(0, -1).map(m => ({
                  role: m.role,
                  parts: [{ text: m.content }]
              })),
              language: languageLabel,
              userMessage: userMessage,
          });
          
          const modelMessage: Message = { role: 'model', content: result.reply };
          setMessages(prev => [...prev, modelMessage]);

          await handlePlayAudio(result.reply, toLanguage);

      } catch (error) {
          console.error("Conversation failed", error);
          toast({
              variant: 'destructive',
              title: 'Conversation Error',
              description: 'Could not get a response from the AI.',
          });
      } finally {
          setIsReplying(false);
      }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);


  return (
    <div className="flex flex-col h-[calc(100vh-14rem)]">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
          <div className="flex items-center gap-4">
              <div>
                  <h2 className="text-2xl font-bold font-headline">Live Practice</h2>
                  <p className="text-muted-foreground">Practice your new language skills with an AI tutor.</p>
              </div>
          </div>
          <div className="w-full sm:w-auto sm:max-w-xs">
              <Label htmlFor="conversation-language">Practice Language</Label>
              <Select value={toLanguage} onValueChange={(value) => {
                  setToLanguage(value as LanguageCode);
                  setMessages([]); // Reset conversation on language change
              }}>
                  <SelectTrigger id="conversation-language">
                      <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                      {languages.map(lang => (
                          <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
      </header>

      <Card className="flex-1 mt-6 flex flex-col shadow-lg">
          <CardContent className="flex-1 flex flex-col p-4 md:p-6">
              <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef as any}>
                  <div className="space-y-6">
                      {messages.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground pt-20">
                              <Sparkles className="h-12 w-12 mb-4" />
                              <h2 className="text-xl font-semibold">Start the conversation!</h2>
                              <p>Click the microphone button to speak in {languages.find(l=>l.value === toLanguage)?.label}.</p>
                          </div>
                      )}
                      {messages.map((message, index) => (
                          <div key={index} className={cn(
                              "flex items-start gap-4",
                              message.role === 'user' ? 'justify-end' : 'justify-start'
                          )}>
                              {message.role === 'model' && (
                                  <Avatar className="w-8 h-8 border">
                                      <AvatarFallback><Bot /></AvatarFallback>
                                  </Avatar>
                              )}
                              <div className={cn(
                                  "max-w-sm md:max-w-md lg:max-w-lg p-3 rounded-lg flex items-center gap-2",
                                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              )}>
                                <p>{message.content}</p>
                                {message.role === 'model' && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => handlePlayAudio(message.content, toLanguage)}
                                        disabled={isPlayingAudio || isRecognizing || isReplying}
                                    >
                                        <Volume2 className="h-4 w-4" />
                                    </Button>
                                )}
                              </div>
                              {message.role === 'user' && (
                                  <Avatar className="w-8 h-8 border">
                                      <AvatarFallback><User /></AvatarFallback>
                                  </Avatar>
                              )}
                          </div>
                      ))}
                  </div>
              </ScrollArea>
              <div className="mt-4 pt-4 border-t flex justify-center">
                  <Button
                      size="lg"
                      className="rounded-full w-20 h-20"
                      onClick={recognizeFromMicrophone}
                      disabled={isRecognizing || isReplying || isPlayingAudio}
                  >
                      {isRecognizing || isReplying ? (
                          <LoaderCircle className="h-8 w-8 animate-spin" />
                      ) : (
                          <Mic className="h-8 w-8" />
                      )}
                      <span className="sr-only">Speak</span>
                  </Button>
              </div>
          </CardContent>
      </Card>
    </div>
  );
}
