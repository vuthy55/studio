
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
import { doc, getDoc, writeBatch, serverTimestamp, increment, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'path';

type ConversationStatus = 'idle' | 'listening' | 'speaking' | 'disabled';

export default function SyncLiveContent() {
  const { user, userProfile, settings, fetchUserProfile } = useUserData();
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH']);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastSpoken, setLastSpoken] = useState<{ lang: string; text: string } | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  
  const { toast } = useToast();
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const costPerMinute = settings?.costPerSyncMinute || 1;

  useEffect(() => {
    // Cleanup function to abort recognition and clear timers if the component unmounts
    return () => {
      abortRecognition();
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
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

   const startSessionTimers = useCallback(() => {
    if (!user || !settings || hasStarted) return;
    setHasStarted(true);
    
    // Main session timer for display
    sessionTimerRef.current = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);

    // Token deduction timer
    const freeMinutes = settings.freeSyncLiveMinutes || 0;
    const initialDelay = freeMinutes * 60 * 1000;

    const deductTokens = async () => {
        if (!auth.currentUser) return;
        const currentBalance = (await getDoc(doc(db, 'users', auth.currentUser.uid))).data()?.tokenBalance || 0;

        if (currentBalance >= costPerMinute) {
             const batch = writeBatch(db);
             const userRef = doc(db, 'users', auth.currentUser.uid);
             const logRef = doc(collection(userRef, 'transactionLogs'));

             batch.update(userRef, { tokenBalance: increment(-costPerMinute) });
             batch.set(logRef, {
                 actionType: 'translation_spend',
                 tokenChange: -costPerMinute,
                 timestamp: serverTimestamp(),
                 description: `Sync Live session usage: 1 minute`
             });
             await batch.commit();
             fetchUserProfile(); // Refresh profile to show new balance
        } else {
             setStatus('disabled');
             toast({ variant: 'destructive', title: 'Session Ended', description: 'Insufficient tokens to continue.' });
             if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
        }
    };

    setTimeout(() => {
      deductTokens(); // First deduction after free minutes
      setInterval(deductTokens, 60 * 1000); // Subsequent deductions every minute
    }, initialDelay);

  }, [user, settings, hasStarted, costPerMinute, fetchUserProfile, toast]);
  
  const startConversationTurn = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to use Sync Live.' });
        return;
    }
    
    if (!hasStarted) {
        startSessionTimers();
    }
    
    setStatus('listening');
    
    try {
        const { detectedLang, text: originalText } = await recognizeWithAutoDetect(selectedLanguages);
        
        setStatus('speaking');
        
        const fromLangLabel = getAzureLanguageLabel(detectedLang);
        setLastSpoken({ lang: fromLangLabel, text: originalText });
        
        const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
        
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
    }
  };

  const allLanguageOptions = useMemo(() => {
    return azureLanguages.filter(l => !selectedLanguages.includes(l.value));
  }, [selectedLanguages]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
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
                Tap the mic to talk. Your speech will be translated and spoken aloud for the group. The mic becomes available again after all translations have played.
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
                        <span>Cost: <strong>{costPerMinute}/min</strong></span>
                    </div>
                   </div>
                   <div className="flex items-center gap-1.5" title="Session time">
                        <Clock className="h-4 w-4" />
                        <span>Time: <strong>{formatTime(sessionTime)}</strong></span>
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
