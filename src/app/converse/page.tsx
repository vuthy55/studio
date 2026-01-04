
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { simpleLanguages } from '@/lib/simple-languages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2, Coins, Clock, HelpCircle, Radio, Dot } from 'lucide-react';
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
import type { AzureLanguageCode } from '@/lib/azure-languages';
import { createRecordedConversationAction, addTranscriptTurnAction } from '@/actions/user';
import { collectionGroup, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RecordedConversation } from '@/lib/types';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'disabled';
type RecordingStatus = 'stopped' | 'confirming' | 'recording';

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
  const [persistedLanguages, setPersistedLanguages] = useLocalStorage<AzureLanguageCode[]>('syncLiveSelectedLanguages', ['en-US', 'km-KH']);
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'km-KH']);
  const [isClient, setIsClient] = useState(false);
  
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('stopped');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  
  const [speakingLanguage, setSpeakingLanguage] = useState<string | null>(null);
  const [sessionUsage, setSessionUsage] = useState(0);
  const [sessionTokensUsed, setSessionTokensUsed] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const sessionUsageRef = useRef(0);
  
  const { toast } = useToast();
  const { startTour } = useTour();

  const [debugLog, setDebugLog] = useState<string[]>([]);
  const log = (message: string) => {
    setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };


  const costPerMinute = settings?.costPerSyncLiveMinute || 1;
  const freeMinutesMs = (settings?.freeSyncLiveMinutes || 0) * 60 * 1000;
  
  useEffect(() => {
    setIsClient(true);
    setSelectedLanguages(persistedLanguages);
  }, [persistedLanguages]);


  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []); 

  const startConversationTurn = async () => {
    log('--- Turn Started ---');
    if (!user || !settings || !userProfile) {
        log('[FAIL] Pre-check failed: User, settings or profile not available.');
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to use this feature.' });
        return;
    }
    
    // Check for access right before starting.
    const hasFreeMinutes = (syncLiveUsage || 0) + sessionUsageRef.current < freeMinutesMs;
    const hasTokens = (userProfile.tokenBalance || 0) >= costPerMinute;

    if (!hasFreeMinutes && !hasTokens) {
        log('[FAIL] Pre-check failed: No free minutes and insufficient tokens.');
        setStatus('disabled');
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You need at least 1 token to continue.' });
        return;
    }
    
    // If status was disabled, but now we have tokens, re-enable it.
    if(status === 'disabled') {
        setStatus('idle');
    }

    log('[INFO] Pre-checks passed.');

    setStatus('listening');
    setSpeakingLanguage(null);
    log(`[STATE] Status set to 'listening'.`);
    
    timeoutRef.current = setTimeout(() => {
        log('[FAIL] Recognition timed out after 30 seconds.');
        setStatus('idle');
        toast({ variant: 'destructive', title: 'Timeout', description: 'Recognition timed out after 30 seconds.' });
    }, 30000);
    
    const turnStartTime = Date.now();
    log(`[INFO] Calling recognizeWithAutoDetect with languages: ${selectedLanguages.join(', ')}`);
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages, log);
        log(`[SUCCESS] recognizeWithAutoDetect resolved. Detected: '${detectedLang}', Text: '${originalText}'`);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (!originalText) {
            log('[INFO] No original text returned. Ending turn gracefully.');
            setStatus('idle'); // Explicitly set back to idle
            return;
        }

        setStatus('speaking');
        log(`[STATE] Status set to 'speaking'.`);

        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        log(`[INFO] Target languages for translation: ${targetLanguages.join(', ')}`);
        
        for (const targetLangLocale of targetLanguages) {
            const fromLangLabel = simpleLanguages.find(l => l.value === detectedLang)?.label || detectedLang;
            const toLangLabel = simpleLanguages.find(l => l.value === targetLangLocale)?.label || targetLangLocale;
            log(`[INFO] Translating from '${fromLangLabel}' to '${toLangLabel}'.`);
            setSpeakingLanguage(toLangLabel);
            
            const translationResult = await translateText({
                text: originalText,
                fromLanguage: fromLangLabel,
                toLanguage: toLangLabel,
            });
            const translatedText = translationResult.translatedText;
            log(`[SUCCESS] Translation successful. Result: "${translatedText}"`);

             if (activeConversationId) {
                await addTranscriptTurnAction(activeConversationId, {
                    originalText,
                    translatedText,
                    speaker: fromLangLabel,
                    fromLanguage: fromLangLabel,
                    toLanguage: toLangLabel,
                });
                log(`[RECORDING] Saved transcript turn to conversation ${activeConversationId}`);
            }
            
            const { audioDataUri } = await generateSpeech({ text: translatedText, lang: targetLangLocale });
            log(`[SUCCESS] Generated speech audio data URI.`);

            if (audioPlayerRef.current) {
                audioPlayerRef.current.src = audioDataUri;
                await audioPlayerRef.current.play();
                log(`[INFO] Playing audio for ${toLangLabel}.`);
                await new Promise<void>(resolve => {
                    if(audioPlayerRef.current) {
                        audioPlayerRef.current.onended = () => {
                            log(`[SUCCESS] Audio playback finished for ${toLangLabel}.`);
                            resolve();
                        };
                        audioPlayerRef.current.onerror = (e) => {
                            log(`[FAIL] Audio playback error: ${JSON.stringify(e)}`);
                            resolve(); 
                        };
                    } else {
                        resolve();
                    }
                });
            }
        }
    } catch (error: any) {
        log(`[FAIL] CATCH BLOCK REACHED: ${error.message}`);
        if (String(error).includes('aborted') || String(error).includes('canceled')) {
            log('[INFO] Recognition was canceled or aborted by user/system.');
         } else {
             toast({ variant: "destructive", title: "Recognition Error", description: "Could not recognize speech. Please try again." });
        }
    } finally {
        log(`[INFO] FINALLY BLOCK REACHED.`);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const turnDuration = Date.now() - turnStartTime;
        
        sessionUsageRef.current += turnDuration;
        setSessionUsage(sessionUsageRef.current);

        const tokensIncurred = updateSyncLiveUsage(turnDuration, 'live');
        setSessionTokensUsed(prev => prev + tokensIncurred);
        log(`[INFO] Turn duration: ${turnDuration}ms. Tokens incurred this turn: ${tokensIncurred}.`);

        setStatus('idle');
        setSpeakingLanguage(null);
        log(`[STATE] Status set to 'idle'.`);
        log('--- Turn Ended ---');
    }
  };


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

    const handleStartRecording = async () => {
        if (!user || !settings) return;

        const fee = settings.recordingFee || 50;
        if ((userProfile?.tokenBalance || 0) < fee) {
            toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${fee} tokens to start a recording.` });
            return;
        }

        try {
            const newConversationId = await createRecordedConversationAction(user.uid, `New Recording - ${new Date().toLocaleString()}`, selectedLanguages.map(l => simpleLanguages.find(sl => sl.value === l)?.label || l));
            setActiveConversationId(newConversationId);
            setRecordingStatus('recording');
            toast({ title: 'Recording Started', description: 'Your conversation is now being recorded.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not start the recording session.' });
        }
    };

    const handleStopRecording = () => {
        setRecordingStatus('stopped');
        setActiveConversationId(null);
        toast({ title: 'Recording Stopped', description: 'Your session has been saved.' });
    };

  
  const allLanguageOptions = useMemo(() => {
    return simpleLanguages.filter(l => !selectedLanguages.includes(l.value as AzureLanguageCode));
  }, [selectedLanguages]);

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

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
                                {simpleLanguages.find(l => l.value === lang)?.label || lang}
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

                <div className="flex flex-col items-center gap-4">
                     <Button
                        size="lg"
                        className={cn(
                            "rounded-full w-40 h-40 text-lg transition-all duration-300 ease-in-out",
                            status === 'listening' && 'bg-green-500 hover:bg-green-600 animate-pulse',
                            status === 'speaking' && 'bg-blue-500 hover:bg-blue-600',
                            (status === 'idle') && 'bg-primary hover:bg-primary/90',
                            status === 'disabled' && 'bg-destructive/80 cursor-not-allowed'
                        )}
                        onClick={startConversationTurn}
                        disabled={status === 'listening' || status === 'speaking' || recordingStatus === 'confirming'}
                        data-tour="sl-mic-button"
                    >
                        {status === 'idle' && <Mic className="h-16 w-16"/>}
                        {status === 'listening' && <LoaderCircle className="h-20 w-20 animate-spin" />}
                        {status === 'speaking' && <Volume2 className="h-20 w-20" />}
                        {status === 'disabled' && <X className="h-16 w-16"/>}
                    </Button>
                    <div className="text-center h-5">
                        {recordingStatus === 'recording' && (
                            <div className="flex items-center gap-2 text-destructive font-semibold animate-pulse">
                                <Dot /> REC
                            </div>
                        )}
                    </div>
                </div>


                <div className="text-center h-16 w-full p-2 bg-secondary/50 rounded-lg flex flex-col justify-center" data-tour="sl-status-display">
                    {status === 'idle' && <p className="font-semibold text-muted-foreground text-sm">Tap the mic to start speaking</p>}
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

                 {debugLog.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="debug-log">
                        <AccordionTrigger className="text-sm">View Debug Log</AccordionTrigger>
                        <AccordionContent>
                            <ScrollArea className="h-40 w-full rounded-md border p-2">
                                <pre className="text-xs whitespace-pre-wrap">
                                    {debugLog.join('\n')}
                                </pre>
                            </ScrollArea>
                        </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
