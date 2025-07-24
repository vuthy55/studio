
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Check, X, Languages } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { type LanguageCode, languages, phrasebook, type Phrase } from '@/lib/data';
import type { PracticeStats } from '@/app/profile/page';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserData } from '@/context/UserDataContext';
import useLocalStorage from '@/hooks/use-local-storage';
import type { SavedPhrase, DetailedHistory } from '@/lib/types';
import MainHeader from '@/components/layout/MainHeader';


export default function StatsPage() {
    const { user, loading, practiceHistory, getTopicStats } = useUserData();
    const router = useRouter();
    
    const [isDialogDataLoading, setIsDialogDataLoading] = useState(false);
    const [selectedLanguageForDialog, setSelectedLanguageForDialog] = useState<LanguageCode | null>(null);
    const [detailedHistoryForDialog, setDetailedHistoryForDialog] = useState<DetailedHistory[]>([]);
    
    const [savedPhrases] = useLocalStorage<SavedPhrase[]>('savedPhrases', []);
    const allPhrases = useMemo(() => phrasebook.flatMap(topic => topic.phrases), []);

    useEffect(() => {
        if (!loading && !user) {
            // Clear sensitive data before redirecting
            setDetailedHistoryForDialog([]);
            router.push('/login');
        }
    }, [user, loading, router]);
    
    const getTranslation = (textObj: Phrase | { english: string; translations: Partial<Record<LanguageCode, string>>; pronunciations?: Partial<Record<LanguageCode, string>> }, lang: LanguageCode) => {
        if (lang === 'english') {
            return textObj.english;
        }
        return (textObj as Phrase).translations[lang] || textObj.english;
    }

    const openLanguageDialog = (langCode: LanguageCode) => {
        if (!user) return;
        setSelectedLanguageForDialog(langCode);
        setIsDialogDataLoading(true);

        const detailedHistory: DetailedHistory[] = [];

        for (const phraseId in practiceHistory) {
            const historyDoc = practiceHistory[phraseId];
            const hasPracticeData = historyDoc.passCountPerLang?.[langCode] || historyDoc.failCountPerLang?.[langCode];

            if (hasPracticeData) {
                let phraseText = "Unknown Phrase";

                if (phraseId.startsWith('saved_')) {
                    const saved = savedPhrases.find(p => p.id === phraseId);
                    if (saved) {
                        phraseText = saved.toLang === langCode ? saved.toText : saved.fromText;
                    }
                } else {
                    const phrase = allPhrases.find(p => p.id === phraseId);
                    if (phrase) {
                        phraseText = getTranslation(phrase, langCode);
                    }
                }

                detailedHistory.push({
                    id: phraseId,
                    phraseText: phraseText,
                    passCount: historyDoc.passCountPerLang?.[langCode] ?? 0,
                    failCount: historyDoc.failCountPerLang?.[langCode] ?? 0,
                    lastAccuracy: historyDoc.lastAccuracyPerLang?.[langCode] ?? 0,
                });
            }
        }
        
        setDetailedHistoryForDialog(detailedHistory);
        setIsDialogDataLoading(false);
    };

    const languageStats = useMemo(() => {
        if (!practiceHistory || !user) return [];
        
        const langTotals: Record<string, { practiced: number; correct: number }> = {};
        
        Object.values(practiceHistory).forEach(phraseDoc => {
            if(phraseDoc.passCountPerLang) {
                Object.entries(phraseDoc.passCountPerLang).forEach(([lang, passes]) => {
                    if (!langTotals[lang]) langTotals[lang] = { practiced: 0, correct: 0};
                    langTotals[lang].practiced += passes;
                    langTotals[lang].correct += passes;
                });
            }
            if(phraseDoc.failCountPerLang) {
                Object.entries(phraseDoc.failCountPerLang).forEach(([lang, fails]) => {
                    if (!langTotals[lang]) langTotals[lang] = { practiced: 0, correct: 0};
                    langTotals[lang].practiced += fails;
                });
            }
        });

        return Object.entries(langTotals).map(([langCode, data]) => {
            const langLabel = languages.find(l => l.value === langCode)?.label || langCode;
            const correctPercentage = data.practiced > 0 ? (data.correct / data.practiced) * 100 : 0;
            return {
                code: langCode as LanguageCode,
                label: langLabel,
                practiced: data.practiced,
                correct: data.correct,
                percentage: correctPercentage
            };
        }).sort((a,b) => b.practiced - a.practiced);
    }, [practiceHistory, user]);

    if (loading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedLanguageForDialog(null)}>
            <div className="space-y-8">
                <MainHeader title="Language Performance" description="Your accuracy across all languages practiced." />

                <Card>
                    <CardHeader>
                        <CardTitle>Performance by Language</CardTitle>
                        <CardDescription>A summary of your practice accuracy. Click a row for phrase-by-phrase details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {languageStats.length > 0 ? (
                            languageStats.map(item => (
                                <DialogTrigger key={item.code} asChild>
                                    <div onClick={() => openLanguageDialog(item.code)} className="cursor-pointer hover:bg-muted p-2 rounded-lg">
                                        <div className="flex justify-between items-center mb-1 text-sm">
                                            <p className="font-medium truncate">{item.label}</p>
                                            <p className="text-xs text-muted-foreground">{item.correct} / {item.practiced} correct phrases</p>
                                        </div>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger className="w-full">
                                                    <Progress value={item.percentage} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{item.percentage.toFixed(0)}% Correct</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </DialogTrigger>
                            ))
                        ) : (
                            <div className="flex items-center justify-center h-full pt-8">
                                <p className="text-muted-foreground">No language practice history yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
             <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        Performance Details: {languages.find(l => l.value === selectedLanguageForDialog)?.label}
                    </DialogTitle>
                    <DialogDescription>
                        A detailed breakdown of your practice history for this language.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                    {isDialogDataLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : detailedHistoryForDialog.length > 0 ? (
                        <ScrollArea className="h-72">
                            <ul className="space-y-3 pr-4">
                                {detailedHistoryForDialog.map(history => (
                                    <li key={history.id} className="text-sm border-b pb-2">
                                        <p className="font-semibold">{history.phraseText}</p>
                                        <div className="flex items-center justify-between text-muted-foreground mt-1">
                                            <div className="flex items-center gap-4">
                                                <span className="flex items-center gap-1.5" title="Correct attempts"><Check className="h-4 w-4 text-green-500" /> {history.passCount}</span>
                                                <span className="flex items-center gap-1.5" title="Incorrect attempts"><X className="h-4 w-4 text-red-500" /> {history.failCount}</span>
                                            </div>
                                            <span>Last Accuracy: {history.lastAccuracy.toFixed(0)}%</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </ScrollArea>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No specific practice data found for this language.</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
