
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateSpeech } from '@/services/tts';
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';
import { getAppSettings, type AppSettings } from '@/services/settings';

type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'error';

export default function GroupConverseContent() {
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    getAppSettings().then(setSettings);
  }, []);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }
  }, []);

  // Cleanup function to abort recognition and timeouts if the component unmounts
  useEffect(() => {
    return () => {
        abortRecognition();
        clearTimeoutRef();
    };
  }, [clearTimeoutRef]);


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
  
  const startConversation = useCallback(async () => {
    if (status !== 'idle' && status !== 'error') return; // Don't start if already running
    if (!settings) {
        toast({ variant: 'destructive', title: 'Error', description: 'Settings not loaded yet. Please try again.' });
        setStatus('idle');
        return;
    }
    
    clearTimeoutRef();
    setStatus('listening');
    setLastSpoken(null);

    // Set inactivity timeout
    timeoutRef.current = setTimeout(() => {
        toast({ title: 'Session Timed Out', description: 'Mic turned off due to inactivity.'});
        stopConversation();
    }, (settings.groupConversationTimeout || 30) * 1000);

    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        clearTimeoutRef(); // Speech was detected, clear the timeout
        
        setStatus('speaking');
        setLastSpoken({ lang: getAzureLanguageLabel(detectedLang), text: originalText });
        
        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
        const audioPromises = targetLanguages.map(async (targetLangLocale) => {
            try {
                const toLangLabel = getAzureLanguageLabel(targetLangLocale);
                const translationResult = await translateText({
                    text: originalText,
                    fromLanguage: getAzureLanguageLabel(detectedLang),
                    toLanguage: toLangLabel,
                });
                
                const { audioDataUri } = await generateSpeech({ 
                    text: translationResult.translatedText, 
                    lang: targetLangLocale 
                });

                const audio = new Audio(audioDataUri);
                // Wait for this specific audio to end
                await new Promise<void>((resolve, reject) => {
                    audio.onended = () => resolve();
                    audio.onerror = (e) => {
                        console.error(`Audio playback error for ${toLangLabel}:`, e);
                        reject(new Error(`Failed to play audio for ${toLangLabel}`));
                    };
                    audio.play().catch(e => {
                         console.error(`Audio play() promise rejected for ${toLangLabel}:`, e);
                         reject(e);
                    });
                });
            } catch (langError) {
                console.error(`Error processing language ${targetLangLocale}:`, langError);
                // Don't reject the whole batch, just move on to the next language
                return Promise.resolve();
            }
        });
        
        await Promise.allSettled(audioPromises);
        
        // After all audio has played, loop the conversation by re-listening
        startConversation();

    } catch (error: any) {
        clearTimeoutRef();
        // Don't show toast for expected cancellations/timeouts
        if (error.message && !error.message.includes('SPEECH_NOMATCH') && !error.message.includes('aborted')) {
            console.error("Error during conversation turn:", error);
            toast({ variant: "destructive", title: "Recognition Error", description: error.message });
            setStatus('error');
        } else {
            // This is a normal stop (timeout or user clicked stop)
             setStatus('idle');
        }
    }
  }, [selectedLanguages, clearTimeoutRef, toast, settings, status]);

  const stopConversation = () => {
    clearTimeoutRef();
    abortRecognition();
    setStatus('idle');
  }

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
                Press the microphone to speak. It will be translated and spoken aloud for the group, then listen for the next person.
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
              "rounded-full w-32 h-32 text-lg transition-all duration-300 ease-in-out shadow-lg",
              status === 'listening' && 'bg-green-500 hover:bg-green-600 animate-pulse',
              status === 'speaking' && 'bg-blue-500 hover:bg-blue-600',
              status === 'idle' && 'bg-primary hover:bg-primary/90',
              status === 'error' && 'bg-destructive hover:bg-destructive/90',
              (status === 'listening' || status === 'speaking') && 'bg-red-600 hover:bg-red-700'
          )}
          onClick={status === 'idle' || status === 'error' ? startConversation : stopConversation}
        >
            {status === 'idle' && <Mic className="h-10 w-10"/>}
            {status === 'error' && <Mic className="h-10 w-10"/>}
            {status === 'listening' && <LoaderCircle className="h-12 w-12 animate-spin" />}
            {status === 'speaking' && <Volume2 className="h-12 w-12" />}
            {(status === 'listening' || status === 'speaking') && <StopCircle className="h-10 w-10" />}
        </Button>

        <div className="text-center h-16">
            <p className="font-semibold text-muted-foreground">
                {status === 'idle' && "Press mic to begin"}
                {status === 'listening' && "Listening..."}
                {status === 'speaking' && "Translating & Speaking..."}
                {status === 'error' && "An error occurred. Press Mic to retry."}
            </p>
            {lastSpoken && (
                 <p className="text-sm text-foreground mt-1 truncate max-w-md">
                     <span className="font-bold">{lastSpoken.lang}:</span> "{lastSpoken.text}"
                 </p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
