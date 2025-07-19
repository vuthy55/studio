
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, doc, collectionGroup, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { BarChart, Coins, LoaderCircle, TrendingDown, TrendingUp, CheckCircle, XCircle, Languages } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { formatDistanceToNow, format } from 'date-fns';
import { Line, LineChart, CartesianGrid, XAxis, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { TransactionLog } from '@/lib/types';
import type { PracticeHistory, LanguageCode, languages as langData } from '@/lib/data';
import type { PracticeStats, UserProfile } from '@/app/profile/page';
import { Progress } from '@/components/ui/progress';

interface TransactionLogWithId extends TransactionLog {
    id: string;
}

interface PracticeHistoryWithId extends PracticeHistory {
    id: string;
}

const chartConfig = {
    balance: {
        label: "Token Balance",
        color: "hsl(var(--primary))",
    },
} satisfies ChartConfig

export default function StatsPage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();
    
    const [stats, setStats] = useState<Partial<UserProfile>>({});
    const [transactions, setTransactions] = useState<TransactionLogWithId[]>([]);
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryWithId[]>([]);
    const [isFetching, setIsFetching] = useState(true);

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
                const data = userDoc.data() as UserProfile;
                setStats({ tokenBalance: data.tokenBalance, practiceStats: data.practiceStats });
             }
        }, (err) => console.error("Error fetching stats:", err));

        const transRef = collection(db, 'users', user.uid, 'transactionLogs');
        const qTrans = query(transRef, orderBy('timestamp', 'asc'));
        const transactionsUnsubscribe = onSnapshot(qTrans, (snapshot) => {
            const transData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLogWithId));
            setTransactions(transData);
            setIsFetching(false); 
        }, (err) => {
            console.error("Error fetching transactions: ", err);
            setIsFetching(false);
        });
        
        const fetchPracticeHistory = async () => {
            const historyRef = collection(db, 'users', user.uid, 'practiceHistory');
            const qHistory = query(historyRef, orderBy('lastAttempt', 'desc'));
            const historySnapshot = await getDocs(qHistory);
            const historyData = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeHistoryWithId));
            setPracticeHistory(historyData);
        };
        fetchPracticeHistory();

        return () => {
            statsUnsubscribe();
            transactionsUnsubscribe();
        };

    }, [user, loading, error, router]);
    
    const chartData = useMemo(() => {
        if (transactions.length === 0) return [];
        let runningBalance = 0;
        return transactions.map(log => {
            runningBalance += log.tokenChange;
            return {
                date: log.timestamp ? format(log.timestamp.toDate(), "MMM d") : "Today",
                balance: runningBalance
            };
        });
    }, [transactions]);


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
            const langLabel = langData.find(l => l.value === langCode)?.label || langCode;
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

     if (loading || isFetching) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
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

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Token Usage Over Time</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        {chartData.length > 1 ? (
                            <ChartContainer config={chartConfig} className="w-full h-full">
                                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Line dataKey="balance" type="monotone" stroke="var(--color-balance)" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ChartContainer>
                         ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-muted-foreground">Not enough data to display a chart.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                 <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Languages className="h-5 w-5"/>
                            Language Performance
                        </CardTitle>
                         <CardDescription>Your accuracy across all languages practiced.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[250px] overflow-y-auto space-y-4">
                        {languageStats.length > 0 ? (
                            languageStats.map(item => (
                                <div key={item.code} className="text-sm">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="font-medium truncate">{item.label}</p>
                                        <p className="text-xs text-muted-foreground">{item.correct} / {item.practiced} correct</p>
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
                            ))
                        ) : (
                             <div className="flex items-center justify-center h-full pt-8">
                                <p className="text-muted-foreground">No language practice history yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>A log of your recent token activity.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {transactions.length > 0 ? (
                            transactions.slice(-10).reverse().map(log => (
                            <div key={log.id} className="flex items-center">
                                <div className="p-3 rounded-full bg-secondary">
                                    {log.tokenChange > 0 ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
                                </div>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">{getActionText(log)}</p>
                                    <p className="text-sm text-muted-foreground truncate max-w-xs">{log.description}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className={`font-medium ${log.tokenChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {log.tokenChange > 0 ? '+' : ''}{log.tokenChange}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {log.timestamp ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                                    </p>
                                </div>
                            </div>
                        ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">No transactions yet. Start using the app to see your history!</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

    
