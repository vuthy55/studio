
"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { LoaderCircle, Save, Shield, User as UserIcon, ArrowLeft, Coins, FileText, Edit, Clock, Check, X, Languages, RefreshCw } from "lucide-react";
import Link from 'next/link';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { lightweightCountries } from '@/lib/location-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UserProfile } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import type { TransactionLog, PracticeHistoryState, DetailedHistory } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { languages as allLanguages, phrasebook, type LanguageCode } from '@/lib/data';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { resetLanguageStats } from '@/actions/stats';


interface TransactionLogWithId extends TransactionLog {
    id: string;
}

export default function UserDetailPage() {
    const params = useParams();
    const userId = params.userId as string;
    const [adminUser, adminLoading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();

    const [profile, setProfile] = useState<Partial<UserProfile>>({});
    const [transactions, setTransactions] = useState<TransactionLogWithId[]>([]);
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryState>({});
    
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);
    const [isFetchingLogs, setIsFetchingLogs] = useState(true);
    const [isFetchingStats, setIsFetchingStats] = useState(true);

    const [selectedLanguageForDialog, setSelectedLanguageForDialog] = useState<LanguageCode | null>(null);
    const [detailedHistoryForDialog, setDetailedHistoryForDialog] = useState<DetailedHistory[]>([]);
    const [isDialogDataLoading, setIsDialogDataLoading] = useState(false);

    const [isResettingStats, setIsResettingStats] = useState(false);

    const countryOptions = useMemo(() => lightweightCountries, []);

    const fetchAllUserData = useCallback(async (uid: string) => {
        setIsFetchingProfile(true);
        setIsFetchingLogs(true);
        setIsFetchingStats(true);
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as UserProfile & { id: string });
            } else {
                toast({ variant: "destructive", title: "Not Found", description: "This user does not exist." });
                router.push('/admin');
                return;
            }
        } catch (fetchError) {
             console.error("Error fetching user profile:", fetchError);
             toast({ variant: "destructive", title: "Error", description: "Could not fetch user profile." });
        } finally {
            setIsFetchingProfile(false);
        }

        try {
            const transRef = collection(db, 'users', uid, 'transactionLogs');
            const q = query(transRef, orderBy('timestamp', 'desc'));
            const transSnapshot = await getDocs(q);
            const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLogWithId));
            setTransactions(transData);
        } catch (fetchError) {
            console.error("Error fetching transaction logs:", fetchError);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch transaction logs." });
        } finally {
            setIsFetchingLogs(false);
        }

        await fetchPracticeHistory(uid);
       
    }, [router, toast]);
    
    const fetchPracticeHistory = useCallback(async (uid: string) => {
         setIsFetchingStats(true);
         try {
            const historyRef = collection(db, 'users', uid, 'practiceHistory');
            const historySnapshot = await getDocs(historyRef);
            const historyData: PracticeHistoryState = {};
            historySnapshot.forEach(doc => {
                historyData[doc.id] = doc.data();
            });
            setPracticeHistory(historyData);
         } catch (fetchError) {
            console.error("Error fetching practice history:", fetchError);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch practice stats." });
         } finally {
            setIsFetchingStats(false);
         }
    }, [toast]);


    useEffect(() => {
        if (adminLoading) return;
        if (!adminUser) {
            setProfile({});
            setTransactions([]);
            router.push('/login');
            return;
        }
        if (userId) {
            fetchAllUserData(userId);
        }
    }, [adminUser, adminLoading, router, userId, fetchAllUserData]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setProfile(prev => ({ ...prev, [id]: type === 'number' ? Number(value) : value }));
    };

    const handleCountryChange = (value: string) => {
        setProfile(prev => ({ ...prev, country: value }));
    };
    
    const handleRoleChange = (isNowAdmin: boolean) => {
        if (adminUser?.uid === userId) {
            toast({ variant: "destructive", title: "Action not allowed", description: "You cannot change your own role."});
            return;
        }
        setProfile(prev => ({ ...prev, role: isNowAdmin ? 'admin' : 'user' }));
    }

    const handleSaveChanges = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adminUser) return;
        setIsSaving(true);
        try {
            const userDocRef = doc(db, 'users', userId);
            const { name, email, country, mobile, role, tokenBalance, syncLiveUsage, syncOnlineUsage } = profile;
            
            await setDoc(userDocRef, { 
                name, 
                email, 
                country, 
                mobile, 
                role, 
                tokenBalance,
                syncLiveUsage: syncLiveUsage || 0,
                syncOnlineUsage: syncOnlineUsage || 0,
                searchableName: (name || '').toLowerCase(),
                searchableEmail: (email || '').toLowerCase()
            }, { merge: true });
            
            toast({ title: 'Success', description: 'User profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update profile. ' + error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const getInitials = (name?: string) => {
        return name ? name.charAt(0).toUpperCase() : (profile.email?.charAt(0).toUpperCase() || '?');
    };
    
     const getActionText = (log: TransactionLog) => {
        if (log.actionType === 'p2p_transfer') {
            return log.tokenChange > 0 ? `Received from ${log.fromUserEmail}` : `Sent to ${log.toUserEmail}`;
        }
        switch (log.actionType) {
            case 'admin_issue': return log.reason || 'Admin Issue';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Sync Online Usage';
            case 'practice_earn': return 'Practice Reward';
            case 'signup_bonus': return 'Welcome Bonus';
            case 'purchase': return 'Token Purchase';
            case 'referral_bonus': return 'Referral Bonus';
            default: return 'Unknown Action';
        }
    }
    
    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const languageStats = useMemo(() => {
        if (!practiceHistory || !userId) return [];
        
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
            const langLabel = allLanguages.find(l => l.value === langCode)?.label || langCode;
            const correctPercentage = data.practiced > 0 ? (data.correct / data.practiced) * 100 : 0;
            return {
                code: langCode as LanguageCode,
                label: langLabel,
                practiced: data.practiced,
                correct: data.correct,
                percentage: correctPercentage
            };
        }).sort((a,b) => b.practiced - a.practiced);
    }, [practiceHistory, userId]);

    const openLanguageDialog = async (langCode: LanguageCode) => {
        setSelectedLanguageForDialog(langCode);
        setIsDialogDataLoading(true);

        const allPhrases = phrasebook.flatMap(topic => topic.phrases);
        const detailedHistory: DetailedHistory[] = [];

        for (const phraseId in practiceHistory) {
            const historyDoc = practiceHistory[phraseId];
            if (historyDoc.passCountPerLang?.[langCode] || historyDoc.failCountPerLang?.[langCode]) {
                const phrase = allPhrases.find(p => p.id === phraseId);
                const phraseText = phrase ? phrase.english : "Unknown Phrase";

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

     const handleResetStats = async (langCode: LanguageCode, langLabel: string) => {
        setIsResettingStats(true);
        try {
            const result = await resetLanguageStats(userId, langCode);
            if (result.success) {
                toast({ title: "Stats Reset", description: `Practice history for ${langLabel} has been cleared.`});
                await fetchPracticeHistory(userId); // Re-fetch the practice history to update the UI
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error || "Failed to reset stats." });
            }
        } catch (error: any) {
            console.error("Error resetting language stats:", error);
            toast({ variant: 'destructive', title: 'Client Error', description: "An unexpected error occurred." });
        } finally {
            setIsResettingStats(false);
        }
    }


    if (adminLoading || isFetchingProfile) {
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
                <SidebarTrigger className="md:hidden"/>
                <Button variant="ghost" asChild>
                    <Link href="/admin">
                        <ArrowLeft className="mr-2 h-4 w-4"/>
                        Back to All Users
                    </Link>
                </Button>
            </header>
            
            <div className="w-full max-w-sm mx-auto">
                <Card>
                    <CardHeader className="items-center text-center">
                        <Avatar className="h-24 w-24 text-4xl">
                            <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-2xl pt-2">{profile.name || 'User Name'}</CardTitle>
                        <CardDescription>{profile.email}</CardDescription>
                        <div className="flex items-center gap-2 text-lg font-bold text-amber-500 pt-2">
                        <Coins className="h-6 w-6" />
                        <span>{profile.tokenBalance ?? 0}</span>
                        </div>
                    </CardHeader>
                    <CardContent className="text-center">
                            {profile.role === 'admin' ? 
                            <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                            <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                        }
                    </CardContent>
                </Card>
            </div>
                
            <div>
                <Tabs defaultValue="edit" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="edit">Edit Profile</TabsTrigger>
                        <TabsTrigger value="usage">Usage</TabsTrigger>
                        <TabsTrigger value="stats">Stats</TabsTrigger>
                        <TabsTrigger value="logs">Transaction Logs</TabsTrigger>
                    </TabsList>
                    <TabsContent value="edit" className="mt-6">
                        <form onSubmit={handleSaveChanges}>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Edit /> Edit Profile</CardTitle>
                                    <CardDescription>Modify the user's details below.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                     <div className="space-y-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input id="name" value={profile.name || ''} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" type="email" value={profile.email || ''} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="mobile">Mobile Number</Label>
                                        <Input id="mobile" type="tel" value={profile.mobile || ''} onChange={handleInputChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="country">Country</Label>
                                        <Select value={profile.country || ''} onValueChange={handleCountryChange}>
                                            <SelectTrigger id="country">
                                                <SelectValue placeholder="Select user's country" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {countryOptions.map(country => (
                                                    <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tokenBalance">Token Balance</Label>
                                        <Input id="tokenBalance" type="number" value={profile.tokenBalance || 0} onChange={handleInputChange} />
                                    </div>
                                    <div className="flex items-center space-x-2 rounded-md border p-4">
                                        <div className="flex-1 space-y-1">
                                            <p className="text-sm font-medium leading-none">Administrator Role</p>
                                            <p className="text-sm text-muted-foreground">
                                            Admins can manage users and other app settings.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={profile.role === 'admin'}
                                            onCheckedChange={handleRoleChange}
                                            disabled={adminUser?.uid === userId}
                                            aria-label="Toggle admin role"
                                        />
                                    </div>
                                        <div className="flex justify-end">
                                        <Button type="submit" disabled={isSaving}>
                                            {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                            Save Changes
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </form>
                    </TabsContent>
                    <TabsContent value="usage" className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Clock /> Feature Usage</CardTitle>
                                <CardDescription>A summary of the user's feature usage.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                                    <Label>Sync Live Usage</Label>
                                    <span className="font-mono text-sm">{formatDuration(profile.syncLiveUsage || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                                    <Label>Sync Online Usage (Current Cycle)</Label>
                                    <span className="font-mono text-sm">{formatDuration(profile.syncOnlineUsage || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                                    <Label>Last Usage Reset Date</Label>
                                    <span className="font-mono text-sm">
                                        {profile.syncOnlineUsageLastReset ? format((profile.syncOnlineUsageLastReset as Timestamp).toDate(), 'PPpp') : 'Not set'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="stats" className="mt-6">
                         <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Languages /> Language Performance</CardTitle>
                                <CardDescription>A summary of this user's practice accuracy across languages.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isFetchingStats ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : languageStats.length > 0 ? (
                                    languageStats.map(item => (
                                         <div key={item.code} className="group flex items-center gap-2 hover:bg-muted p-2 rounded-lg">
                                            <DialogTrigger asChild>
                                                <div className="flex-grow cursor-pointer" onClick={() => openLanguageDialog(item.code)}>
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
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" disabled={isResettingStats}>
                                                        <RefreshCw className="h-4 w-4 text-destructive"/>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Reset stats for {item.label}?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently delete all practice history (passes, fails, accuracy) for {item.label} for this user. This action cannot be undone and will not affect any tokens the user has already earned.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleResetStats(item.code, item.label)} disabled={isResettingStats}>
                                                             {isResettingStats && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                                            Confirm Reset
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">No practice stats found for this user.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="logs" className="mt-6">
                            <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText />
                                    Transaction Logs
                                </CardTitle>
                                <CardDescription>A complete history of this user's token activity.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isFetchingLogs ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : transactions.length > 0 ? (
                                    <div className="border rounded-md min-h-[200px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                    <TableHead>Reason</TableHead>
                                                    <TableHead>Description</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {transactions.map(log => (
                                                    <TableRow key={log.id}>
                                                        <TableCell>{log.timestamp ? format((log.timestamp as Timestamp).toDate(), 'd MMM yyyy, HH:mm') : 'N/A'}</TableCell>
                                                        <TableCell className={`text-right font-medium ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell>{getActionText(log)}</TableCell>
                                                        <TableCell className="max-w-xs truncate">
                                                             {log.description}
                                                            {log.duration && ` (${formatDuration(log.duration)})`}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">No transaction logs found for this user.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
             <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        Performance Details: {allLanguages.find(l => l.value === selectedLanguageForDialog)?.label}
                    </DialogTitle>
                    <DialogDescription>
                        A detailed breakdown of this user's practice history for this language.
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
        </div>
        </Dialog>
    );
}
