
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
import { auth, db } from '@/lib/firebase';
import { writeBatch, doc, collection, serverTimestamp, increment } from 'firebase/firestore';


type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'disabled';

export default function SyncLiveContent() {
  const { user, userProfile, settings, fetchUserProfile } = useUserData();
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);

  // New state for usage-based timing
  const [accumulatedUsage, setAccumulatedUsage] = useState(0); // in milliseconds
  const turnStartTimeRef = useRef<number | null>(null);
  const lastChargedMinute = useRef(0);
  
  const { toast } = useToast();

  const costPerMinute = settings?.costPerSyncLiveMinute || 1;
  const freeMinutes = settings?.freeSyncLiveMinutes || 0;

  useEffect(() => {
    return () => abortRecognition();
  }, []);

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
    if (!user || !settings) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to use Sync Live.' });
        return;
    }
    
    setStatus('listening');
    turnStartTimeRef.current = Date.now();
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        
        setStatus('speaking');
        setLastSpoken({ lang: getAzureLanguageLabel(detectedLang), text: originalText });
        
        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
        for (const targetLangLocale of targetLanguages) {
            const toLangLabel = getAzureLanguageLabel(targetLangLocale);
            
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

            await new Promise(resolve => {
                audio.onended = () => setTimeout(resolve, 1500);
                audio.onerror = () => setTimeout(resolve, 1500);
            });
        }
    } catch (error: any) {
        if (error.message !== 'Recognition was aborted.') {
             toast({ variant: "destructive", title: "Error", description: "No recognized speech" });
        }
    } finally {
        setStatus('idle');
        if (turnStartTimeRef.current) {
            const turnDuration = Date.now() - turnStartTimeRef.current;
            const newTotalUsage = accumulatedUsage + turnDuration;
            setAccumulatedUsage(newTotalUsage);
            
            // Check if token deduction is needed
            const totalUsageMinutes = Math.floor(newTotalUsage / 60000);
            const freeMinutesUsed = Math.floor(freeMinutes);
            const chargeableMinutes = Math.max(0, totalUsageMinutes - freeMinutesUsed);

            if (chargeableMinutes > lastChargedMinute.current) {
                const minutesToCharge = chargeableMinutes - lastChargedMinute.current;
                const tokensToDeduct = minutesToCharge * costPerMinute;

                const currentBalance = userProfile?.tokenBalance ?? 0;
                if (currentBalance >= tokensToDeduct) {
                    const batch = writeBatch(db);
                    const userRef = doc(db, 'users', user.uid);
                    
                    for (let i = 0; i < minutesToCharge; i++) {
                        const logRef = doc(collection(userRef, 'transactionLogs'));
                        batch.set(logRef, {
                            actionType: 'translation_spend',
                            tokenChange: -costPerMinute,
                            timestamp: serverTimestamp(),
                            description: `Sync Live usage: 1 minute`
                        });
                    }
                    batch.update(userRef, { tokenBalance: increment(-tokensToDeduct) });
                    
                    await batch.commit();
                    fetchUserProfile(); // Refresh profile to show new balance
                    lastChargedMinute.current = chargeableMinutes;
                    toast({title: "Tokens Deducted", description: `${tokensToDeduct} tokens for ${minutesToCharge} minute(s) of usage.`});
                } else {
                    setStatus('disabled');
                    toast({ variant: 'destructive', title: 'Session Ended', description: 'Insufficient tokens to continue.' });
                }
            }
        }
        turnStartTimeRef.current = null;
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
                <div className="flex items-center justify-between text-sm pt-2 text-muted-foreground">
                   <div className="flex items-center gap-4">
                     <div className="flex items-center gap-1.5" title="Your token balance">
                        <Coins className="h-4 w-4 text-amber-500" />
                        <span>Balance: <strong>{userProfile?.tokenBalance ?? '...'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5" title="Cost per minute after free period">
                        <Coins className="h-4 w-4 text-red-500" />
                        <span>Cost: <strong>{costPerMinute}/min after {freeMinutes} free min</strong></span>
                    </div>
                   </div>
                   <div className="flex items-center gap-1.5" title="Total active usage time">
                        <Clock className="h-4 w-4" />
                        <span>Usage: <strong>{formatTime(accumulatedUsage)}</strong></span>
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

        <div className="text-center h-16">
            <p className="font-semibold text-muted-foreground">
                {status === 'idle' && "Tap the mic to start speaking"}
                {status === 'listening' && "Listening..."}
                {status === 'speaking' && "Translating & Speaking..."}
                {status === 'disabled' && "Session disabled due to insufficient tokens."}
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
