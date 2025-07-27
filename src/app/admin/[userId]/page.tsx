

"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs, Timestamp, onSnapshot } from 'firebase/firestore';
import { LoaderCircle, Save, Shield, User as UserIcon, ArrowLeft, Coins, FileText, Edit, Clock, Check, X, Languages, RefreshCw, Trash2, Wallet, CreditCard, Users as UsersIcon, AlertTriangle } from "lucide-react";
import Link from 'next/link';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import type { TransactionLog, PracticeHistoryState, DetailedHistory, SavedPhrase, PaymentLog } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { languages as allLanguages, phrasebook, type LanguageCode, type Phrase } from '@/lib/data';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { resetLanguageStats, resetUsageStats } from '@/actions/stats';
import { deleteUsers, clearUserPaymentHistory } from '@/actions/admin';
import useLocalStorage from '@/hooks/use-local-storage';
import { getReferredUsers, ReferredUser } from '@/actions/referrals';


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
    const [payments, setPayments] = useState<PaymentLog[]>([]);
    const [referrals, setReferrals] = useState<ReferredUser[]>([]);
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryState>({});
    const [savedPhrases] = useLocalStorage<SavedPhrase[]>('savedPhrases', []);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);
    
    // On-demand loading states
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [hasFetchedLogs, setHasFetchedLogs] = useState(false);
    const [isFetchingPayments, setIsFetchingPayments] = useState(false);
    const [hasFetchedPayments, setHasFetchedPayments] = useState(false);
    const [isFetchingReferrals, setIsFetchingReferrals] = useState(false);
    const [hasFetchedReferrals, setHasFetchedReferrals] = useState(false);
    const [isFetchingStats, setIsFetchingStats] = useState(false);
    const [hasFetchedStats, setHasFetchedStats] = useState(false);


    const [selectedLanguageForDialog, setSelectedLanguageForDialog] = useState<LanguageCode | null>(null);
    const [detailedHistoryForDialog, setDetailedHistoryForDialog] = useState<DetailedHistory[]>([]);
    const [isDialogDataLoading, setIsDialogDataLoading] = useState(false);

    const [isResetting, setIsResetting] = useState(false);
    const [isClearingHistory, setIsClearingHistory] = useState(false);

    const countryOptions = useMemo(() => lightweightCountries, []);
    
    const allPhrases = useMemo(() => phrasebook.flatMap(topic => topic.phrases), []);

    const fetchUserProfileData = useCallback(async (uid: string) => {
        setIsFetchingProfile(true);
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as UserProfile & { id: string });
            } else {
                toast({ variant: "destructive", title: "Not Found", description: "This user does not exist." });
                router.push('/admin');
            }
        } catch (fetchError) {
             console.error("Error fetching user profile:", fetchError);
             toast({ variant: "destructive", title: "Error", description: "Could not fetch user profile." });
        } finally {
            setIsFetchingProfile(false);
        }
    }, [router, toast]);
    
    const handleFetchPracticeHistory = useCallback(async () => {
         if (!userId) return;
         setIsFetchingStats(true);
         try {
            const historyRef = collection(db, 'users', userId, 'practiceHistory');
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
            setHasFetchedStats(true);
         }
    }, [toast, userId]);

     const handleFetchLogs = useCallback(async () => {
        if (!userId) return;
        setIsFetchingLogs(true);
        const transRef = collection(db, 'users', userId, 'transactionLogs');
        const q = query(transRef, orderBy('timestamp', 'desc'));
        try {
            const snapshot = await getDocs(q);
            setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TransactionLogWithId)));
        } catch (error) {
            console.error("Error fetching transaction logs:", error);
            toast({ variant: "destructive", title: "Log Error", description: "Could not fetch transaction logs." });
        } finally {
            setIsFetchingLogs(false);
            setHasFetchedLogs(true);
        }
    }, [userId, toast]);

    const handleFetchPayments = useCallback(async () => {
        if (!userId) return;
        setIsFetchingPayments(true);
        const paymentsRef = collection(db, 'users', userId, 'paymentHistory');
        const q = query(paymentsRef, orderBy('createdAt', 'desc'));
        try {
            const snapshot = await getDocs(q);
            setPayments(snapshot.docs.map(d => d.data() as PaymentLog));
        } catch (error) {
            console.error("Error fetching payment history:", error);
            toast({ variant: "destructive", title: "Payment Error", description: "Could not fetch payment history." });
        } finally {
            setIsFetchingPayments(false);
            setHasFetchedPayments(true);
        }
    }, [userId, toast]);

    const handleFetchReferrals = useCallback(async () => {
        if (!userId || hasFetchedReferrals) return;
        setIsFetchingReferrals(true);
        try {
            const referredUsers = await getReferredUsers(userId);
            setReferrals(referredUsers);
        } catch (error) {
            console.error("Error fetching referrals:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load referrals for this user.' });
        } finally {
            setIsFetchingReferrals(false);
            setHasFetchedReferrals(true);
        }
    }, [userId, toast, hasFetchedReferrals]);

    useEffect(() => {
        if (adminLoading) return;
        if (!adminUser) {
            setProfile({});
            setTransactions([]);
            setPayments([]);
            router.push('/login');
            return;
        }
        if (userId) {
            fetchUserProfileData(userId);
        }
    }, [adminUser, adminLoading, router, userId, fetchUserProfileData, toast]);


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
            const { name, email, country, mobile, role, syncLiveUsage, syncOnlineUsage } = profile;
            
            await setDoc(userDocRef, { 
                name, 
                email, 
                country, 
                mobile, 
                role, 
                // tokenBalance is intentionally omitted to prevent direct edits
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

    const handleDeleteUser = async () => {
        if (!profile.email || deleteConfirmation !== profile.email) {
            toast({ variant: 'destructive', title: 'Confirmation failed', description: 'The email address does not match.'});
            return;
        }

        setIsDeleting(true);
        const result = await deleteUsers([userId]);
        if (result.success) {
            toast({ title: 'User Deleted', description: `${profile.email} has been permanently deleted.`});
            router.push('/admin?tab=users');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete user.' });
            setIsDeleting(false);
        }
    }
    
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
            case 'sync_online_refund': return 'Sync Online Refund';
            case 'language_pack_download': return 'Language Pack Download';
            default: return 'Prep Your Vibe';
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

    const getTranslation = (textObj: Phrase, lang: LanguageCode) => {
        if (lang === 'english') {
            return textObj.english;
        }
        return textObj.translations[lang] || textObj.english;
    }

    const openLanguageDialog = (langCode: LanguageCode) => {
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

     const handleResetStats = async (langCode: LanguageCode, langLabel: string) => {
        setIsResetting(true);
        try {
            const result = await resetLanguageStats(userId, langCode);
            if (result.success) {
                toast({ title: "Stats Reset", description: `Practice history for ${langLabel} has been cleared.`});
                await handleFetchPracticeHistory();
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error || "Failed to reset stats." });
            }
        } catch (error: any) {
            console.error("Error resetting language stats:", error);
            toast({ variant: 'destructive', title: 'Client Error', description: "An unexpected error occurred." });
        } finally {
            setIsResetting(false);
        }
    }

    const handleResetUsage = async () => {
        setIsResetting(true);
        try {
            const result = await resetUsageStats(userId);
            if (result.success) {
                toast({ title: "Usage Reset", description: "Feature usage stats for this user have been cleared."});
                await fetchUserProfileData(userId);
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error || "Failed to reset usage stats." });
            }
        } catch (error: any) {
            console.error("Error resetting usage stats:", error);
            toast({ variant: 'destructive', title: 'Client Error', description: "An unexpected error occurred." });
        } finally {
            setIsResetting(false);
        }
    }

    const handleClearPaymentHistory = async () => {
        setIsClearingHistory(true);
        try {
            const result = await clearUserPaymentHistory(userId);
            if (result.success) {
                toast({ title: 'History Cleared', description: "This user's payment history has been deleted." });
                setPayments([]);
                setHasFetchedPayments(true); // To prevent re-fetching deleted data
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not clear history.' });
            }
        } catch (error) {
            console.error("Error clearing payment history:", error);
            toast({ variant: 'destructive', title: 'Client Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsClearingHistory(false);
        }
    };


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
                    <Link href="/admin?tab=users">
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
                <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                        <TabsTrigger value="usage">Usage</TabsTrigger>
                        <TabsTrigger value="stats">Stats</TabsTrigger>
                        <TabsTrigger value="tokens">Tokens</TabsTrigger>
                        <TabsTrigger value="payments">Payments</TabsTrigger>
                        <TabsTrigger value="referrals">Referrals</TabsTrigger>
                    </TabsList>
                    <TabsContent value="profile" className="mt-6">
                        <form onSubmit={handleSaveChanges}>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Edit /> Profile Details</CardTitle>
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
                                        <Label htmlFor="tokenBalance">Token Balance (Read-only)</Label>
                                        <Input id="tokenBalance" type="number" value={profile.tokenBalance || 0} readOnly disabled />
                                        <p className="text-xs text-muted-foreground">To issue or revoke tokens, please use the "Tokens" tab in the main admin dashboard to ensure a transaction is logged.</p>
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
                         <Card className="mt-6 border-destructive">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle/> Danger Zone</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive">
                                            <Trash2 className="mr-2"/> Permanently Delete User
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action is irreversible. It will permanently delete the user <strong className="font-bold">{profile.email}</strong>, their authentication record, and all associated data (transactions, stats, etc.).
                                                <br/><br/>
                                                To confirm, please type the user's full email address below.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                         <Input 
                                            value={deleteConfirmation}
                                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                                            placeholder={profile.email}
                                        />
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting || deleteConfirmation !== profile.email}>
                                                {isDeleting ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                                Confirm Deletion
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardContent>
                         </Card>
                    </TabsContent>
                    <TabsContent value="usage" className="mt-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><Clock /> Feature Usage</CardTitle>
                                    <CardDescription>A summary of the user's feature usage.</CardDescription>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" disabled={isResetting}>
                                            {isResetting ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
                                            Reset Usage
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Reset Usage Stats?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will reset Sync Live and Sync Online usage counters to zero for this user. This cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleResetUsage} disabled={isResetting}>
                                                {isResetting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                                Confirm Reset
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
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
                                <Button onClick={handleFetchPracticeHistory} disabled={isFetchingStats || hasFetchedStats}>
                                    {isFetchingStats ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                    {hasFetchedStats ? "Stats Loaded" : "Load Stats"}
                                </Button>
                                {isFetchingStats ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : hasFetchedStats && (
                                    languageStats.length > 0 ? (
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
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" disabled={isResetting}>
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
                                                            <AlertDialogAction onClick={() => handleResetStats(item.code, item.label)} disabled={isResetting}>
                                                                {isResetting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                                                Confirm Reset
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-muted-foreground py-8">No practice stats found for this user.</p>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="tokens" className="mt-6">
                            <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Wallet />
                                    Token Ledger
                                </CardTitle>
                                <CardDescription>A complete history of this user's token activity.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={handleFetchLogs} disabled={isFetchingLogs || hasFetchedLogs} className="mb-4">
                                    {isFetchingLogs ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                    {hasFetchedLogs ? "Logs Loaded" : "Load Logs"}
                                </Button>
                                {isFetchingLogs ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : hasFetchedLogs && (
                                    transactions.length > 0 ? (
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
                                    )
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="payments" className="mt-6">
                            <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <CreditCard />
                                        Payment History
                                    </CardTitle>
                                    <CardDescription>A record of this user's PayPal transactions.</CardDescription>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button 
                                            variant="destructive" 
                                            size="sm"
                                            disabled={isClearingHistory || !hasFetchedPayments || payments.length === 0}
                                        >
                                            {isClearingHistory ? <LoaderCircle className="animate-spin mr-2"/> : <Trash2 className="mr-2"/>}
                                            Clear History
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Clear Payment History?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all payment records for {profile.email}. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleClearPaymentHistory} disabled={isClearingHistory}>
                                                {isClearingHistory && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                                Confirm Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={handleFetchPayments} disabled={isFetchingPayments || hasFetchedPayments} className="mb-4">
                                    {isFetchingPayments ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                    {hasFetchedPayments ? "Payments Loaded" : "Load Payments"}
                                </Button>
                                {isFetchingPayments ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : hasFetchedPayments && (
                                    payments.length > 0 ? (
                                        <div className="border rounded-md min-h-[200px]">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Description</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                        <TableHead>Order ID</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {payments.map(p => (
                                                        <TableRow key={p.orderId}>
                                                            <TableCell>{p.createdAt ? format((p.createdAt as Timestamp).toDate(), 'd MMM yyyy, HH:mm') : 'N/A'}</TableCell>
                                                            <TableCell className="font-medium">{p.tokensPurchased > 0 ? `Purchased ${p.tokensPurchased} Tokens` : 'Donation'}</TableCell>
                                                            <TableCell className="text-right font-bold">${p.amount.toFixed(2)} {p.currency}</TableCell>
                                                            <TableCell className="text-muted-foreground">{p.orderId}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground py-8">No payment history found.</p>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="referrals" className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <UsersIcon />
                                    Referred Users
                                </CardTitle>
                                <CardDescription>A list of users referred by this individual.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={handleFetchReferrals} disabled={isFetchingReferrals || hasFetchedReferrals}>
                                    {isFetchingReferrals ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                    {hasFetchedReferrals ? "Referrals Loaded" : "Load Referrals"}
                                </Button>
                                {isFetchingReferrals ? (
                                     <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : hasFetchedReferrals && (
                                     <div className="border rounded-md min-h-[200px] mt-4">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Email</TableHead>
                                                    <TableHead>Date Joined</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {referrals.length > 0 ? (
                                                    referrals.map(ref => (
                                                        <TableRow key={ref.id}>
                                                            <TableCell>{ref.name || 'N/A'}</TableCell>
                                                            <TableCell>{ref.email}</TableCell>
                                                            <TableCell>{ref.createdAt ? format(new Date(ref.createdAt), 'd MMM yyyy, HH:mm') : 'N/A'}</TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="h-24 text-center">No referred users found.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
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
