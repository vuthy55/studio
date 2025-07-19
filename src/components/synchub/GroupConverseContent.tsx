
"use client";

import { useState, useMemo } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateSpeech } from '@/services/tts';

type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'error';

export default function GroupConverseContent() {
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);

  const { toast } = useToast();

  const handleLanguageSelect = (lang: AzureLanguageCode) => {
    if (selectedLanguages.length < 4 && !selectedLanguages.includes(lang)) {
      setSelectedLanguages(prev => [...prev, lang]);
    } else if (selectedLanguages.length >= 4) {
      toast({ variant: 'destructive', title: 'Limit Reached', description: 'You can select a maximum of 4 languages.' });
    }
  };

  const removeLanguage = (langToRemove: AzureLanguageCode) => {
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
    let recognizer: sdk.SpeechRecognizer | null = null;
    
    try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const autoDetectSourceLanguageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(selectedLanguages);

        recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig, audioConfig);
        
        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
          recognizer!.recognizeOnceAsync(resolve, reject);
        });

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            setStatus('speaking');
            
            const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
            const detectedLangLocale = autoDetectResult.language;
            const originalText = result.text;
            
            const fromLangLabel = getAzureLanguageLabel(detectedLangLocale);
            setLastSpoken({ lang: fromLangLabel, text: originalText });
            
            const targetLanguages = selectedLanguages.filter(l => l !== detectedLangLocale);
            
            for (const targetLangLocale of targetLanguages) {
                const toLangLabel = getAzureLanguageLabel(targetLangLocale);
                
                const translationResult = await translateText({
                    text: originalText,
                    fromLanguage: fromLangLabel,
                    toLanguage: toLangLabel,
                });
                const translatedText = translationResult.translatedText;
                
                const { audioDataUri } = await generateSpeech({ 
                  text: translatedText, 
                  lang: targetLangLocale 
                });
                const audio = new Audio(audioDataUri);
                await audio.play();
                // Wait for the audio to finish playing before proceeding to the next one
                await new Promise(resolve => {
                    audio.onended = resolve;
                    audio.onerror = resolve; // also resolve on error to not block the loop
                });
            }
        } else {
            const errorDetails = result.errorDetails || "No speech could be recognized.";
            toast({ variant: 'destructive', title: 'Recognition Failed', description: errorDetails });
        }

    } catch (error: any) {
        console.error("Error during conversation turn:", error);
        toast({ variant: "destructive", title: "Error", description: `An error occurred: ${error.message}` });
        setStatus('error');
    } finally {
        if (recognizer) {
            recognizer.close();
        }
        setStatus('idle');
    }
  };

  const allLanguageOptions = useMemo(() => {
    return azureLanguages.filter(l => !selectedLanguages.includes(l.value));
  }, [selectedLanguages]);

  return (
    <Card className="shadow-lg mt-6 w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
                <Users className="h-7 w-7 text-primary"/>
                Group Conversation
            </CardTitle>
            <CardDescription>
                Press the microphone to speak. It will be translated and spoken aloud for the group. The mic will be available again after.
            </CardDescription>
        </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="w-full space-y-4">
            <Label className="flex items-center gap-2 font-semibold"><Languages className="h-5 w-5"/> Conversation Languages ({selectedLanguages.length}/4)</Label>
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border bg-muted min-h-[4rem]">
                {selectedLanguages.map(lang => (
                    <Badge key={lang} variant="secondary" className="text-base py-1 px-3">
                        {getAzureLanguageLabel(lang)}
                        <button onClick={() => removeLanguage(lang)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5" disabled={status !== 'idle'}>
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                {selectedLanguages.length < 4 && (
                     <Select onValueChange={(val) => handleLanguageSelect(val as AzureLanguageCode)} disabled={status !== 'idle'}>
                        <SelectTrigger className="w-40 h-9 border-dashed">
                            <SelectValue placeholder="Add language..." />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="h-72">
                            {allLanguageOptions.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                    </Select>
                )}
            </div>
        </div>

        <Button
          size="lg"
          className={cn(
              "rounded-full w-32 h-32 text-lg transition-all duration-300 ease-in-out",
              status === 'listening' && 'bg-green-500 hover:bg-green-600 animate-pulse',
              status === 'speaking' && 'bg-blue-500 hover:bg-blue-600',
              (status === 'idle' || status === 'error') && 'bg-primary hover:bg-primary/90'
          )}
          onClick={startConversation}
          disabled={status !== 'idle'}
        >
          {status === 'idle' && <><Mic className="h-10 w-10 mr-2"/> Speak</>}
          {status === 'listening' && <LoaderCircle className="h-12 w-12 animate-spin" />}
          {status === 'speaking' && <Volume2 className="h-12 w-12" />}
          {status === 'error' && <><Mic className="h-10 w-10 mr-2"/> Retry</>}
        </Button>

        <div className="text-center h-16">
            <p className="font-semibold text-muted-foreground">
                {status === 'idle' && "Press Speak to begin"}
                {status === 'listening' && "Listening..."}
                {status === 'speaking' && "Translating & Speaking..."}
                {status === 'error' && "An error occurred. Press Retry."}
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
