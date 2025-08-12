
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2, Coins, Clock, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateSpeech } from '@/services/tts';
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';
import { useUserData } from '@/context/UserDataContext';
import useLocalStorage from '@/hooks/use-local-storage';
import { useTour, TourStep } from '@/context/TourContext';
import MainHeader from '@/components/layout/MainHeader';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'disabled';

const syncLiveTourSteps: TourStep[] = [
  {
    selector: '[data-tour="sl-languages"]',
    content: "Step 1: Select a minimum of 2 and up to 4 languages to be translated.",
  },
  {
    selector: '[data-tour="sl-mic-button"]',
    content: "Step 2: Click the mic and speak in any of the selected languages. Wait for the translation and audio output.",
    position: 'top',
  },
  {
    selector: '[data-tour="sl-usage-card"]',
    content: "Step 3: Click here to check your token and usage status.",
    position: 'top',
  },
];


export default function ConversePage() {
  const { user, userProfile, settings, syncLiveUsage, updateSyncLiveUsage } = useUserData();
  const [persistedLanguages, setPersistedLanguages] = useLocalStorage<AzureLanguageCode[]>('syncLiveSelectedLanguages', ['en-US', 'th-TH']);
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [isClient, setIsClient] = useState(false);
  
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [speakingLanguage, setSpeakingLanguage] = useState<string | null>(null);
  const [sessionUsage, setSessionUsage] = useState(0);
  const [sessionTokensUsed, setSessionTokensUsed] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const sessionUsageRef = useRef(0);
  
  const { toast } = useToast();
  const { startTour } = useTour();
  const [isOnline, setIsOnline] = useState(true);

  const costPerMinute = settings?.costPerSyncLiveMinute || 1;
  const freeMinutesMs = (settings?.freeSyncLiveMinutes || 0) * 60 * 1000;
  
  useEffect(() => {
    setIsClient(true);
    setSelectedLanguages(persistedLanguages);
  }, [persistedLanguages]);

   useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
        setIsOnline(navigator.onLine);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // This effect now exclusively handles cleanup.
    // It will be called when the component unmounts.
    return () => {
      // abortRecognition is designed to be safe to call even if no recognition is active.
      abortRecognition();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount.


  const startConversationTurn = async () => {
    if (!user || !settings) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to use this feature.' });
        return;
    }
    
    const hasSufficientTokens = (userProfile?.tokenBalance ?? 0) >= costPerMinute;
    
    if (!hasSufficientTokens && (syncLiveUsage || 0) + sessionUsageRef.current >= freeMinutesMs) {
        setStatus('disabled');
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You may not have enough tokens for the next minute of usage.'});
        return;
    }

    setStatus('listening');
    setSpeakingLanguage(null);
    
    timeoutRef.current = setTimeout(() => {
        abortRecognition();
        setStatus('idle');
        toast({ variant: 'destructive', title: 'Timeout', description: 'Recognition timed out after 30 seconds.' });
    }, 30000);
    
    const turnStartTime = Date.now();
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        setStatus('speaking');

        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
        for (const targetLangLocale of targetLanguages) {
            const toLangLabel = getAzureLanguageLabel(targetLangLocale);
            setSpeakingLanguage(toLangLabel);
            
            const translationResult = await translateText({
                text: originalText,
                fromLanguage: getAzureLanguageLabel(detectedLang),
                toLanguage: toLangLabel,
            });
            const translatedText = translationResult.translatedText;
            
            const { audioDataUri } = await generateSpeech({ text: translatedText, lang: targetLangLocale });

            if (audioPlayerRef.current) {
                audioPlayerRef.current.src = audioDataUri;
                await audioPlayerRef.current.play();
                await new Promise<void>(resolve => {
                    if(audioPlayerRef.current) {
                        audioPlayerRef.current.onended = () => resolve();
                        audioPlayerRef.current.onerror = (e) => {
                            console.error("Audio playback error:", e);
                            resolve(); 
                        };
                    } else {
                        resolve();
                    }
                });
            }
        }
    } catch (error: any) {
         if (error.message !== 'Recognition was aborted.') {
             toast({ variant: "destructive", title: "Recognition Error", description: "Could not recognize speech. Please try again." });
        }
    } finally {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const turnDuration = Date.now() - turnStartTime;
        
        sessionUsageRef.current += turnDuration;
        setSessionUsage(sessionUsageRef.current);

        const tokensIncurred = updateSyncLiveUsage(turnDuration, 'live');
        setSessionTokensUsed(prev => prev + tokensIncurred);

        setStatus('idle');
        setSpeakingLanguage(null);
    }
  };

  const calculateCostForDuration = useCallback((durationMs: number) => {
    const chargeableMs = Math.max(0, durationMs - freeMinutesMs);
    if (chargeableMs === 0) return 0;

    const billedMinutes = Math.ceil(chargeableMs / (60 * 1000));
    return billedMinutes * costPerMinute;
  }, [costPerMinute, freeMinutesMs]);


  const handleLanguageSelect = (lang: AzureLanguageCode) => {
    if (selectedLanguages.length < 4 && !selectedLanguages.includes(lang)) {
      setPersistedLanguages(prev => [...prev, lang]);
    } else if (selectedLanguages.length >= 4) {
      toast({ variant: 'destructive', title: 'Limit Reached', description: 'You can select a maximum of 4 languages.' });
    }
  };

  const removeLanguage = (langToRemove: AzureLanguageCode) => {
    if (selectedLanguages.length > 2) {
      setPersistedLanguages(prev => prev.filter(lang => lang !== langToRemove));
    } else {
      toast({ variant: 'destructive', title: 'Minimum Required', description: 'You need at least 2 languages for a conversation.' });
    }
  };
  
  const allLanguageOptions = useMemo(() => {
    return azureLanguages.filter(l => !selectedLanguages.includes(l.value));
  }, [selectedLanguages]);

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  useEffect(() => {
      const hasSufficientTokens = (userProfile?.tokenBalance ?? 0) >= costPerMinute;
      
      if (status === 'idle' && !hasSufficientTokens && (syncLiveUsage || 0) >= freeMinutesMs) {
        setStatus('disabled');
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You may not have enough tokens for the next minute of usage.'});
      }
  }, [status, syncLiveUsage, userProfile?.tokenBalance, calculateCostForDuration, freeMinutesMs, toast, costPerMinute]);
  
  if (!isClient) {
      return (
        <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
          <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
        </div>
      );
  }


  return (
    <div className="space-y-6">
        <MainHeader title="Live Conversation" description="Speak into your device and have it translated aloud." />

        <Card className="shadow-lg w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                    <Users className="h-7 w-7 text-primary"/>
                    1-on-1 Conversation
                </CardTitle>
                <CardDescription>
                    Select up to 4 languages to be translated. Tap the mic to talk in any of the selected languages. The system will recognize your spoken language. Your speech will be translated to the other selected language(s) and spoken aloud.
                </CardDescription>
                <div className="flex flex-col items-center gap-4 text-center pt-4">
                    <Button onClick={() => startTour(syncLiveTourSteps)} size="lg">
                        <HelpCircle className="mr-2" />
                        Take a Tour
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-8 p-6">
                
                <div className="w-full space-y-4" data-tour="sl-languages">
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

                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div>
                                <Button
                                    size="lg"
                                    className={cn(
                                        "rounded-full w-40 h-40 text-lg transition-all duration-300 ease-in-out",
                                        status === 'listening' && 'bg-green-500 hover:bg-green-600 animate-pulse',
                                        status === 'speaking' && 'bg-blue-500 hover:bg-blue-600',
                                        (status === 'idle') && 'bg-primary hover:bg-primary/90',
                                        status === 'disabled' && 'bg-destructive/80 cursor-not-allowed',
                                        !isOnline && 'bg-muted-foreground cursor-not-allowed'
                                    )}
                                    onClick={startConversationTurn}
                                    disabled={status !== 'idle' || !isOnline}
                                    data-tour="sl-mic-button"
                                >
                                    {status === 'idle' && <Mic className="h-16 w-16"/>}
                                    {status === 'listening' && <LoaderCircle className="h-20 w-20 animate-spin" />}
                                    {status === 'speaking' && <Volume2 className="h-20 w-20" />}
                                    {status === 'disabled' && <X className="h-16 w-16"/>}
                                </Button>
                            </div>
                        </TooltipTrigger>
                         {!isOnline && (
                            <TooltipContent>
                                <p>Conversation is disabled while offline.</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                 </TooltipProvider>

                <div className="text-center h-16 w-full p-2 bg-secondary/50 rounded-lg flex flex-col justify-center" data-tour="sl-status-display">
                    {status === 'idle' && !isOnline && <p className="font-semibold text-muted-foreground text-sm">You are offline. Live Conversation is disabled.</p>}
                    {status === 'idle' && isOnline && <p className="font-semibold text-muted-foreground text-sm">Tap the mic to start speaking</p>}
                    {status === 'listening' && <p className="font-semibold text-muted-foreground text-sm">Listening...</p>}
                    {status === 'speaking' && speakingLanguage && <p className="text-lg text-primary font-bold">Speaking: {speakingLanguage}</p>}
                    {status === 'disabled' && <p className="font-semibold text-destructive text-sm">Session disabled due to insufficient tokens.</p>}
                </div>
                
                {user && settings && (
                    <Accordion type="single" collapsible className="w-full" data-tour="sl-usage-card">
                        <AccordionItem value="item-1">
                            <AccordionTrigger>
                                <div className="flex items-center gap-2">
                                     <Coins className="h-5 w-5 text-amber-500" />
                                    <span>Token Balance: {userProfile?.tokenBalance ?? '...'}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Free Time Left</Label>
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-primary" />
                                            <p className="text-lg font-bold">{formatTime(Math.max(0, freeMinutesMs - (syncLiveUsage || 0)))}</p>
                                        </div>
                                    </div>
                                     <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Session Usage</Label>
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-muted-foreground" />
                                            <p className="font-mono text-base">{formatTime(sessionUsage)}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Session Tokens Used</Label>
                                        <div className="flex items-center gap-2">
                                            <Coins className="h-5 w-5 text-red-500" />
                                            <p className="font-mono text-base">{sessionTokensUsed}</p>
                                        </div>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}


                <audio ref={audioPlayerRef} className="hidden" />
            </CardContent>
        </Card>
    </div>
  );
}
