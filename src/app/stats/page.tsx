
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { BarChart, Coins, LoaderCircle, CheckCircle, XCircle, Languages, FileText, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { formatDistanceToNow, format } from 'date-fns';
import type { TransactionLog } from '@/lib/types';
import { type PracticeHistory, type LanguageCode, languages } from '@/lib/data';
import type { PracticeStats, UserProfile } from '@/app/profile/page';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TransactionLogWithId extends TransactionLog {
    id: string;
}

interface PracticeHistoryWithId extends PracticeHistory {
    id: string;
}

interface DetailedHistory extends PracticeHistory {
    id: string;
    passCount: number;
    failCount: number;
    lastAccuracy: number;
}

export default function StatsPage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();
    
    const [stats, setStats] = useState<Partial<UserProfile>>({});
    const [transactions, setTransactions] = useState<TransactionLogWithId[]>([]);
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryWithId[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    
    const [activeTab, setActiveTab] = useState('performance');

    const [isDialogDataLoading, setIsDialogDataLoading] = useState(false);
    const [selectedLanguageForDialog, setSelectedLanguageForDialog] = useState<LanguageCode | null>(null);
    const [detailedHistoryForDialog, setDetailedHistoryForDialog] = useState<DetailedHistory[]>([]);

    useEffect(() => {
        if (loading) return;
        if (error) {
            console.error("Auth error:", error);
            router.push('/login');
            return;
        }
        if (!user) {
            router.push('/login');
            return;
        }

        setIsFetching(true);
        
        const userDocRef = doc(db, 'users', user.uid);
        const statsUnsubscribe = onSnapshot(userDocRef, (userDoc) => {
             if (userDoc.exists()) {
                setStats(userDoc.data());
             }
             setIsFetching(false);
        }, (err) => {
            console.error("Error fetching stats:", err);
            setIsFetching(false);
        });
        
        // Return only the stats listener, as other data will be fetched on demand
        return () => statsUnsubscribe();
    }, [user, loading, error, router]);
    
    const fetchTransactions = useCallback(async () => {
        if (!user) return;
        setIsFetching(true);
        const transRef = collection(db, 'users', user.uid, 'transactionLogs');
        const qTrans = query(transRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(qTrans);
        const transData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLogWithId));
        setTransactions(transData);
        setIsFetching(false);
    }, [user]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        if (value === 'transactions' && transactions.length === 0) {
            fetchTransactions();
        }
    }
    
    const openLanguageDialog = async (langCode: LanguageCode) => {
        if (!user) return;
        setSelectedLanguageForDialog(langCode);
        setIsDialogDataLoading(true);

        const historyRef = collection(db, 'users', user.uid, 'practiceHistory');
        const historySnapshot = await getDocs(historyRef);
        const detailedHistory: DetailedHistory[] = [];

        historySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.passCountPerLang?.[langCode] || data.failCountPerLang?.[langCode]) {
                detailedHistory.push({
                    id: doc.id,
                    phraseText: data.phraseText,
                    passCount: data.passCountPerLang?.[langCode] ?? 0,
                    failCount: data.failCountPerLang?.[langCode] ?? 0,
                    lastAccuracy: data.lastAccuracyPerLang?.[langCode] ?? 0,
                });
            }
        });
        
        setDetailedHistoryForDialog(detailedHistory);
        setIsDialogDataLoading(false);
    };

    const getActionText = (log: TransactionLog) => {
        switch (log.actionType) {
            case 'translation_spend': return 'Live Translation';
            case 'practice_earn': return 'Practice Reward';
            case 'signup_bonus': return 'Welcome Bonus';
            default: return 'Unknown Action';
        }
    };

    const languageStats = useMemo(() => {
        if (!stats.practiceStats?.byLanguage) return [];
        return Object.entries(stats.practiceStats.byLanguage).map(([langCode, data]) => {
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
    }, [stats.practiceStats]);

     if (loading || (isFetching && !stats.email)) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedLanguageForDialog(null)}>
            <div className="space-y-8">
                <header className="flex items-center gap-4">
                    {isMobile && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><BarChart className="h-8 w-8"/> My Stats</h1>
                        <p className="text-muted-foreground">Your progress, achievements, and token history.</p>
                    </div>
                </header>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.tokenBalance ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Your current available tokens</p>
                    </CardContent>
                </Card>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="performance"><Languages className="mr-2 h-4 w-4"/> Language Performance</TabsTrigger>
                        <TabsTrigger value="transactions"><FileText className="mr-2 h-4 w-4"/> Recent Transactions</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="performance">
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>Language Performance</CardTitle>
                                <CardDescription>Your accuracy across all languages practiced. Click a row for details.</CardDescription>
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
                    </TabsContent>

                    <TabsContent value="transactions">
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>Recent Transactions</CardTitle>
                                <CardDescription>A log of your recent token activity.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isFetching && activeTab === 'transactions' ? (
                                    <div className="flex justify-center items-center h-24">
                                        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                ) : transactions.length > 0 ? (
                                    <div className="space-y-4">
                                        {transactions.map(log => (
                                            <div key={log.id} className="flex items-center">
                                                <div className="p-3 rounded-full bg-secondary">
                                                    <div className={`font-bold text-sm ${log.tokenChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {log.tokenChange > 0 ? '+' : ''}{log.tokenChange}
                                                    </div>
                                                </div>
                                                <div className="ml-4 space-y-1">
                                                    <p className="text-sm font-medium leading-none">{getActionText(log)}</p>
                                                    <p className="text-sm text-muted-foreground truncate max-w-xs">{log.description}</p>
                                                </div>
                                                <div className="ml-auto text-right">
                                                    <p className="text-xs text-muted-foreground">
                                                        {log.timestamp ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">No transactions yet.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
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
