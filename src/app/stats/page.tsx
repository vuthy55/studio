
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { BarChart, Coins, LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import type { UserProfile } from '@/app/profile/page';
import { formatDistanceToNow } from 'date-fns';

interface TransactionLog {
    id: string;
    actionType: string;
    tokenChange: number;
    timestamp: Timestamp;
    description: string;
}

export default function StatsPage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();
    
    const [profile, setProfile] = useState<Partial<UserProfile>>({});
    const [transactions, setTransactions] = useState<TransactionLog[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const fetchInitialData = useCallback(async (uid: string) => {
        setIsFetching(true);
        
        // Profile snapshot - listen directly to the user's document
        const userDocRef = doc(db, 'users', uid);
        const profileUnsubscribe = onSnapshot(userDocRef, (userDoc) => {
             if (userDoc.exists()) {
                setProfile({ ...userDoc.data() } as UserProfile);
             }
        });

        // Transactions snapshot
        const transRef = collection(db, 'users', uid, 'transactionLogs');
        const q = query(transRef, orderBy('timestamp', 'desc'), limit(20));
        const transactionsUnsubscribe = onSnapshot(q, (snapshot) => {
            const transData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLog));
            setTransactions(transData);
            setIsFetching(false);
        }, (err) => {
            console.error("Error fetching transactions: ", err);
            setIsFetching(false);
        });

        return () => {
            profileUnsubscribe();
            transactionsUnsubscribe();
        };

    }, []);
    
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
        
        const unsubscribePromise = fetchInitialData(user.uid);
        return () => {
             unsubscribePromise.then(fn => fn()).catch(e => console.error(e));
        }

    }, [user, loading, error, router, fetchInitialData]);

    const getActionText = (log: TransactionLog) => {
        switch (log.actionType) {
            case 'translation_spend': return 'Live Translation';
            case 'practice_earn': return 'Practice Reward';
            case 'signup_bonus': return 'Welcome Bonus';
            default: return 'Unknown Action';
        }
    }

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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{profile.tokenBalance ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Your current available tokens</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                        <CardDescription>A log of your recent token activity.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {transactions.length > 0 ? (
                                transactions.map(log => (
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
        </div>
    )
}
