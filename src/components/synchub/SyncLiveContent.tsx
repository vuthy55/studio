
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';

type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'error';

export default function SyncLiveContent() {
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);
  
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
    }
    console.log('[SyncLive] Starting 10-second inactivity timer.');
    inactivityTimerRef.current = setTimeout(() => {
        console.log('[SyncLive] Inactivity timer fired. Resetting session.');
        setStatus('idle');
        setLastSpoken(null);
        console.log('[SyncLive] Inactivity timer calling abortRecognition.');
        abortRecognition();
        toast({ title: 'Session Resetted', description: 'Conversation reset due to inactivity.' });
    }, 10000); // 10 seconds
  }, [toast]);

  useEffect(() => {
    // Start the timer when the component mounts and languages are selected
    if (selectedLanguages.length > 1) {
        resetInactivityTimer();
    }
    // Cleanup function to abort recognition and clear timers if the component unmounts
    return () => {
      console.log('[SyncLive] Component unmounting. Aborting recognition and clearing timers.');
      abortRecognition();
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [selectedLanguages, resetInactivityTimer]);


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
  
  const startConversationTurn = async () => {
    console.log('[SyncLive] Starting conversation turn. Status: idle -> listening');
    setStatus('listening');
    if (inactivityTimerRef.current) {
        console.log('[SyncLive] Clearing inactivity timer during active listening.');
        clearTimeout(inactivityTimerRef.current);
    }
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        console.log(`[SyncLive] Speech recognized. Language: ${detectedLang}, Text: "${originalText}". Status: listening -> speaking`);
        
        setStatus('speaking');
        
        const fromLangLabel = getAzureLanguageLabel(detectedLang);
        setLastSpoken({ lang: fromLangLabel, text: originalText });
        
        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
        for (const targetLangLocale of targetLanguages) {
            console.log(`[SyncLive] Translating and speaking for ${targetLangLocale}.`);
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
            console.log(`[SyncLive] Playing audio for ${targetLangLocale}.`);
            await audio.play();

            // Wait for audio to finish, with a 2-second pause after.
            await new Promise(resolve => {
                audio.onended = () => {
                    console.log(`[SyncLive] Audio finished for ${targetLangLocale}. Pausing for 2 seconds.`);
                    setTimeout(resolve, 2000);
                }
                audio.onerror = () => {
                     console.error(`[SyncLive] Audio playback error for ${targetLangLocale}.`);
                    setTimeout(resolve, 2000); // also resolve on error
                }
            });
        }
        console.log('[SyncLive] All audio playback complete.');

    } catch (error: any) {
        console.error("[SyncLive] Error during conversation turn:", error);
        // Only show toast if it's not a user-initiated abort
        if (error.message !== 'Recognition was aborted.') {
             const errorMessage = error.message === 'No recognized speech' ? 'No recognized speech' : `An error occurred: ${error.message}`;
             toast({ variant: "destructive", title: "Error", description: errorMessage });
        }
        setStatus('error');
    } finally {
        console.log('[SyncLive] Turn finished. Status -> idle. Restarting inactivity timer.');
        setStatus('idle');
        resetInactivityTimer(); // Restart timer after the turn is fully complete.
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
                Sync Live
            </CardTitle>
            <CardDescription>
                Tap the mic to talk. Your speech will be translated and spoken aloud for the group. The mic becomes available again after all translations have played. The session resets after 10 seconds of inactivity.
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
          onClick={startConversationTurn}
          disabled={status !== 'idle'}
        >
          {status === 'idle' && <Mic className="h-10 w-10"/>}
          {status === 'listening' && <LoaderCircle className="h-12 w-12 animate-spin" />}
          {status === 'speaking' && <Volume2 className="h-12 w-12" />}
          {status === 'error' && <Mic className="h-10 w-10"/>}
        </Button>

        <div className="text-center h-16">
            <p className="font-semibold text-muted-foreground">
                {status === 'idle' && "Tap the mic to start speaking"}
                {status === 'listening' && "Listening..."}
                {status === 'speaking' && "Translating & Speaking..."}
                {status === 'error' && "An error occurred. Tap to try again."}
            </p>
            {lastSpoken && (status === 'speaking' || status === 'listening') && (
                 <p className="text-sm text-foreground mt-1 truncate max-w-md">
                     <span className="font-bold">{lastSpoken.lang}:</span> "{lastSpoken.text}"
                 </p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
