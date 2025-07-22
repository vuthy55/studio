
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, LoaderCircle, X, Languages, Users, Volume2, Coins, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateSpeech } from '@/services/tts';
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';
import { useUserData } from '@/context/UserDataContext';


type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'disabled';

export default function SyncLiveContent() {
  const { user, userProfile, settings, syncLiveUsage, updateSyncLiveUsage } = useUserData();
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [displayText, setDisplayText] = useState<{ lang: string } | null>(null);
  const [sessionUsage, setSessionUsage] = useState(0);
  const [sessionTokensUsed, setSessionTokensUsed] = useState(0);


  const isMounted = useRef(true);
  
  const { toast } = useToast();

  const costPerMinute = settings?.costPerSyncLiveMinute || 1;
  const freeMinutesMs = (settings?.freeSyncLiveMinutes || 0) * 60 * 1000;
  
  // This ref will hold the accumulated usage for the current session.
  // It persists across re-renders without causing them.
  const sessionUsageRef = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    // When the component unmounts, stop any active recognition.
    return () => {
      isMounted.current = false;
      if (status === 'listening' || status === 'speaking') {
        abortRecognition();
      }
    };
  }, [status]);


  const startConversationTurn = async () => {
    if (!user || !settings) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to use Sync Live.' });
        return;
    }
    
    // Check if the user has enough tokens for the *next* minute of paid usage
    const totalUsageAfterNextMinute = (syncLiveUsage || 0) + sessionUsageRef.current + 60000;
    const tokensRequiredForNextMinute = calculateCostForDuration(totalUsageAfterNextMinute) - calculateCostForDuration((syncLiveUsage || 0) + sessionUsageRef.current);
    
    const hasSufficientTokens = (userProfile?.tokenBalance ?? 0) >= tokensRequiredForNextMinute;
    
    if (!hasSufficientTokens && ((syncLiveUsage || 0) + sessionUsageRef.current) >= freeMinutesMs) {
        if (isMounted.current) setStatus('disabled');
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You may not have enough tokens for the next minute of usage.'});
        return;
    }

    if (isMounted.current) {
        setStatus('listening');
        setDisplayText(null);
    }
    
    const turnStartTime = Date.now();
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        
        if (!isMounted.current) return;
        
        setStatus('speaking');

        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
        for (const targetLangLocale of targetLanguages) {
             if (!isMounted.current) {
                abortRecognition(); // Stop further processing if component unmounts
                return;
            };

            const toLangLabel = getAzureLanguageLabel(targetLangLocale);
            
            // Set the language name for display
            if (isMounted.current) setDisplayText({ lang: toLangLabel });
            
            const translationResult = await translateText({
                text: originalText,
                fromLanguage: getAzureLanguageLabel(detectedLang),
                toLanguage: toLangLabel,
            });
            const translatedText = translationResult.translatedText;
            
            const { audioDataUri } = await generateSpeech({ 
                text: translatedText, 
                lang: targetLangLocale 
            });

            const audio = new Audio(audioDataUri);
            await audio.play();

            // Wait for the audio to finish before proceeding to the next language
            await new Promise<void>(resolve => {
                audio.onended = () => resolve();
                audio.onerror = (e) => {
                    console.error("Audio playback error:", e);
                    resolve(); // Resolve anyway to continue the loop
                };
            });
        }
    } catch (error: any) {
        if (isMounted.current && error.message !== 'Recognition was aborted.') {
             toast({ variant: "destructive", title: "Could not recognize speech", description: "Please try speaking again." });
        }
    } finally {
        const turnDuration = Date.now() - turnStartTime;
        if (isMounted.current) {
          // Accumulate session usage in the ref
          sessionUsageRef.current += turnDuration;
          setSessionUsage(sessionUsageRef.current); // Update state for display

          const tokensIncurred = updateSyncLiveUsage(turnDuration);
          setSessionTokensUsed(prev => prev + tokensIncurred);

          setStatus('idle');
          setDisplayText(null);
        }
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
  
  const allLanguageOptions = useMemo(() => {
    return azureLanguages.filter(l => !selectedLanguages.includes(l.value));
  }, [selectedLanguages]);

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const totalTokensSpent = useMemo(() => {
    return calculateCostForDuration(syncLiveUsage || 0);
  }, [syncLiveUsage, calculateCostForDuration]);

  
  useEffect(() => {
      // Check for sufficient tokens when component mounts or dependencies change
      const tokensRequiredForNextMinute = calculateCostForDuration((syncLiveUsage || 0) + 1) - calculateCostForDuration(syncLiveUsage || 0);
      const hasSufficientTokens = (userProfile?.tokenBalance ?? 0) >= tokensRequiredForNextMinute;
      
      if (status === 'idle' && !hasSufficientTokens && (syncLiveUsage || 0) >= freeMinutesMs) {
        setStatus('disabled');
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You may not have enough tokens for the next minute of usage.'});
      }
  }, [status, syncLiveUsage, userProfile?.tokenBalance, calculateCostForDuration, freeMinutesMs, toast]);


  return (
    <Card className="shadow-lg mt-6 w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
                <Users className="h-7 w-7 text-primary"/>
                Sync Live
            </CardTitle>
            <CardDescription>
                Tap the mic to talk. Your speech will be translated and spoken aloud for the group. This is a 1-to-many solo translation feature.
            </CardDescription>
             {user && settings && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2 text-muted-foreground">
                   <div className="flex items-center gap-1.5" title="Your token balance">
                      <Coins className="h-4 w-4 text-amber-500" />
                      <span>Balance: <strong>{userProfile?.tokenBalance ?? '...'}</strong></span>
                  </div>
                   <div className="flex items-center gap-1.5" title="Total tokens spent on this feature across all sessions">
                      <Coins className="h-4 w-4 text-red-500" />
                      <span>Total Used: <strong>{totalTokensSpent}</strong></span>
                   </div>
                   <div className="flex items-center gap-1.5" title="Active usage time this session">
                      <Clock className="h-4 w-4" />
                      <span>Time (Session): <strong>{formatTime(sessionUsage)}</strong></span>
                   </div>
                   <div className="flex items-center gap-1.5" title="Tokens used this session">
                      <Coins className="h-4 w-4 text-red-500" />
                      <span>Tokens (Session): <strong>{sessionTokensUsed}</strong></span>
                   </div>
                </div>
            )}
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
              (status === 'idle') && 'bg-primary hover:bg-primary/90',
              status === 'disabled' && 'bg-destructive/80 cursor-not-allowed'
          )}
          onClick={startConversationTurn}
          disabled={status !== 'idle'}
        >
          {status === 'idle' && <Mic className="h-10 w-10"/>}
          {status === 'listening' && <LoaderCircle className="h-12 w-12 animate-spin" />}
          {status === 'speaking' && <Volume2 className="h-12 w-12" />}
          {status === 'disabled' && <X className="h-10 w-10"/>}
        </Button>

        <div className="text-center h-24 w-full p-2 bg-secondary/50 rounded-lg flex flex-col justify-center">
             {status === 'idle' && <p className="font-semibold text-muted-foreground text-sm">Tap the mic to start speaking</p>}
             {status === 'listening' && <p className="font-semibold text-muted-foreground text-sm">Listening...</p>}
             {status === 'speaking' && displayText && <p className="text-lg text-primary font-bold">Speaking: {displayText.lang}</p>}
             {status === 'disabled' && <p className="font-semibold text-destructive text-sm">Session disabled due to insufficient tokens.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
