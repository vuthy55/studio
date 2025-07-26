
"use client";

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, Timestamp, getDocs, where } from 'firebase/firestore';
import { LoaderCircle, Save, Coins, FileText, Heart, Copy, Send, Wallet, CreditCard, History, Trash2, AlertTriangle, Languages, PhoneOutgoing, Users, Search, UserPlus, UserCheck, XCircle, UserMinus, RefreshCw } from "lucide-react";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { lightweightCountries } from '@/lib/location-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TransactionLog, PaymentLog, BuddyRequest, UserProfile } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { useUserData } from '@/context/UserDataContext';
import BuyTokens from '@/components/BuyTokens';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { transferTokensAction } from '@/actions/ledger';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MainHeader from '@/components/layout/MainHeader';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { anonymizeAndDeactivateUser } from '@/actions/user';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { findUserByEmail } from '@/services/ledger';
import { sendBuddyRequest, acceptBuddyRequest, declineBuddyRequest, removeBuddy, sendBuddyAlert } from '@/actions/friends';
import { resetUserPracticeHistory } from '@/actions/admin';


export interface PracticeStats {
  byLanguage?: {
    [languageCode: string]: {
      practiced: number;
      correct: number;
    };
  };
}

function TokenHistoryDialog() {
    const [user] = useAuthState(auth);
    const [transactions, setTransactions] = useState<(TransactionLog & { id: string })[]>([]);
    const [isLoading, setIsLoading] = useState(true);

     const getActionText = (log: TransactionLog) => {
        if (log.actionType === 'p2p_transfer') {
            return log.tokenChange > 0 ? `Received from ${log.fromUserEmail}` : `Sent to ${log.toUserEmail}`;
        }
        // Use a more descriptive reason for refunds
        if (log.actionType === 'sync_online_refund') {
            return 'Sync Online Refund';
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

     useEffect(() => {
        if (!user) {
            setTransactions([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const transRef = collection(db, 'users', user.uid, 'transactionLogs');
        const q = query(transRef, orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLog & { id: string }));
            setTransactions(data);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching token history:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline"><History className="mr-2"/> History</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Token Ledger</DialogTitle>
                    <DialogDescription>A complete log of your token earnings and spending.</DialogDescription>
                </DialogHeader>
                 <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : transactions.length > 0 ? (
                        <div className="border rounded-md min-h-[200px] max-h-[60vh] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((log, index) => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-xs text-muted-foreground">{String(transactions.length - index).padStart(5, '0')}</span>
                                                    <span className="font-mono text-[10px] text-muted-foreground/60 truncate" title={log.id}>{log.id}</span>
                                                </div>
                                            </TableCell>
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
                    ) : <p className="text-center text-muted-foreground py-8">No token history found.</p>}
                 </div>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function TokenTransferDialog() {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formState, setFormState] = useState({
        toEmail: '',
        amount: '' as number | '',
        reason: 'A gift from a friend!'
    });

    const resetForm = () => {
        setFormState({ toEmail: '', amount: '', reason: 'A gift from a friend!' });
    };

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;

        const { toEmail, amount, reason } = formState;

        if (!toEmail || !amount || amount <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please provide a valid recipient email and a positive amount.' });
            return;
        }
        if (toEmail.toLowerCase() === user.email.toLowerCase()) {
            toast({ variant: 'destructive', title: 'Invalid Recipient', description: 'You cannot transfer tokens to yourself.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await transferTokensAction({
                fromUserId: user.uid,
                fromUserEmail: user.email,
                toUserEmail: toEmail,
                amount: Number(amount),
                description: reason
            });

            if (result.success) {
                toast({ title: 'Transfer Successful!', description: 'You are very generous!' });
                resetForm();
                setIsOpen(false);
            } else {
                toast({ variant: 'destructive', title: 'Transfer Failed', description: result.error });
            }
        } catch (error) {
            console.error('Error transferring tokens:', error);
            toast({ variant: 'destructive', title: 'Client Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><Send className="mr-2"/> Transfer</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Transfer Tokens</DialogTitle>
                    <DialogDescription>Send tokens to another user. This action is irreversible.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleTransfer}>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="transfer-email">Recipient Email</Label>
                            <Input id="transfer-email" type="email" value={formState.toEmail} onChange={e => setFormState(p => ({...p, toEmail: e.target.value}))} placeholder="friend@example.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="transfer-amount">Amount</Label>
                            <Input id="transfer-amount" type="number" value={formState.amount} onChange={e => setFormState(p => ({...p, amount: Number(e.target.value)}))} placeholder="e.g., 50" required min="1" max={userProfile?.tokenBalance || 0} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="transfer-reason">Reason / Message (Optional)</Label>
                            <Textarea id="transfer-reason" value={formState.reason} onChange={e => setFormState(p => ({...p, reason: e.target.value}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost" type="button">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm & Transfer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function TokenWalletCard() {
    const { userProfile } = useUserData();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wallet /> Token Wallet</CardTitle>
                <CardDescription>View your balance and manage your tokens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 text-3xl font-bold text-amber-500 border rounded-lg p-4">
                    <Coins className="h-10 w-10" />
                    <span>{userProfile?.tokenBalance ?? 0}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <BuyTokens />
                    <TokenTransferDialog />
                    <TokenHistoryDialog />
                </div>
            </CardContent>
        </Card>
    );
}

function ProfileSection() {
    const { user, userProfile, logout, fetchUserProfile } = useUserData();
    const { toast } = useToast();
    const router = useRouter();

    const [profile, setProfile] = useState<Partial<UserProfile>>({});
    const [isSaving, setIsSaving] = useState(false);
    const countryOptions = useMemo(() => lightweightCountries, []);
    
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isResettingStats, setIsResettingStats] = useState(false);

    useEffect(() => {
        if(userProfile) {
            setProfile(userProfile);
        }
    }, [userProfile]);

    const handleCountryChange = (countryCode: string) => {
        setProfile(prev => ({ ...prev, country: countryCode }));
        const selected = countryOptions.find(c => c.code === countryCode);
        if (selected && (!profile.mobile || !profile.mobile.startsWith('+'))) {
            setProfile(prev => ({ ...prev, mobile: `+${selected.phone} ` }));
        }
    };
    
    const handleLanguageChange = (langCode: AzureLanguageCode) => {
        setProfile(prev => ({...prev, defaultLanguage: langCode }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSaving(true);
        try {
            if (profile.name && profile.name !== user.displayName) {
                await updateAuthProfile(user, { displayName: profile.name });
            }
            
            const userDocRef = doc(db, 'users', user.uid);
            const { name, country, mobile, defaultLanguage } = profile;
            const dataToSave = {
                name: name || '',
                country: country || '',
                mobile: mobile || '',
                defaultLanguage: defaultLanguage || 'en-US',
                email: user.email,
                searchableName: (name || '').toLowerCase(),
                searchableEmail: (user.email!).toLowerCase(),
            };
            await setDoc(userDocRef, dataToSave, { merge: true });
            toast({ title: 'Success', description: 'Profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update profile. ' + error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const getInitials = (name?: string) => {
        return name ? name.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || '?');
    };

    const handleDeleteAccount = async () => {
        if (!user || !user.email || deleteConfirmation !== 'delete my account') {
            toast({ variant: 'destructive', title: 'Confirmation failed', description: 'The confirmation phrase does not match.'});
            return;
        }

        setIsDeleting(true);
        const result = await anonymizeAndDeactivateUser({ userId: user.uid });
        if (result.success) {
            toast({ title: 'Account Deleted', description: "Your account has been deleted. We're sorry to see you go."});
            // The auth state listener in UserDataContext will handle logout and redirect.
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete your account.' });
            setIsDeleting(false);
        }
    };

    const handleResetStats = async () => {
        if (!user) return;
        setIsResettingStats(true);
        const result = await resetUserPracticeHistory(user.uid);
        if (result.success) {
            toast({ title: 'Stats Reset', description: 'Your practice history has been successfully cleared.'});
            // Manually trigger a refetch of all user data in the context
            await fetchUserProfile();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not reset your stats.'});
        }
        setIsResettingStats(false);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20 text-3xl">
                             <AvatarImage src={user?.photoURL || undefined} alt={profile.name || 'User Avatar'} />
                            <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{profile.name || 'Your Name'}</CardTitle>
                            <CardDescription>{profile.email}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveProfile} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={profile.name || ''} onChange={(e) => setProfile((p: any) => ({...p, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={profile.email || ''} disabled />
                            <p className="text-xs text-muted-foreground">Your email address cannot be changed from this page.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="defaultLanguage">Default Spoken Language</Label>
                            <Select value={profile.defaultLanguage || ''} onValueChange={handleLanguageChange}>
                                <SelectTrigger id="defaultLanguage">
                                    <SelectValue placeholder="Select your preferred language" />
                                </SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-72">
                                    {azureLanguages.map((lang: any) => (
                                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                    ))}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="country">Country</Label>
                            <Select value={profile.country || ''} onValueChange={handleCountryChange}>
                                <SelectTrigger id="country">
                                    <SelectValue placeholder="Select your country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map((country: any) => (
                                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number</Label>
                            <Input id="mobile" type="tel" value={profile.mobile || ''} onChange={(e) => setProfile((p: any) => ({...p, mobile: e.target.value}))} placeholder="e.g., +1 123 456 7890" />
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle/> Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <h4 className="font-semibold">Reset Practice Stats</h4>
                        <p className="text-xs text-muted-foreground">This will permanently delete all your practice history (passes, fails, accuracy). This is useful for clearing old or buggy data but cannot be undone.</p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isResettingStats}>
                                    <RefreshCw className="mr-2"/> 
                                    {isResettingStats ? 'Resetting...' : 'Reset All Practice Stats'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action will permanently delete all of your practice history. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetStats} disabled={isResettingStats}>
                                        {isResettingStats ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                        Confirm & Reset Stats
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-semibold">Delete Account</h4>
                         <p className="text-xs text-muted-foreground">This will permanently deactivate and anonymize your account. Personal info will be deleted, while financial records will be retained anonymously.</p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Trash2 className="mr-2"/> Delete My Account
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action is irreversible. Your account, profile, and practice history will be permanently deleted.
                                        <br/><br/>
                                        To confirm, please type <strong className="text-destructive">delete my account</strong> below.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <Input 
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                                    placeholder="delete my account"
                                />
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleting || deleteConfirmation !== 'delete my account'}>
                                        {isDeleting ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                        Confirm Deletion
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function PaymentHistorySection() {
    const [user] = useAuthState(auth);
    const [payments, setPayments] = useState<PaymentLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchPaymentHistory = useCallback(async () => {
        if (!user || hasFetched) return;
        setIsLoading(true);
        try {
            const paymentsRef = collection(db, 'users', user.uid, 'paymentHistory');
            const q = query(paymentsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => doc.data() as PaymentLog);
            setPayments(data);
        } catch (error) {
            console.error("Error fetching payment history:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch payment history." });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [user, hasFetched, toast]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard /> Your Payments</CardTitle>
                <CardDescription>A record of all your token purchases and donations.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={fetchPaymentHistory} disabled={isLoading || hasFetched} className="mb-4">
                    {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                    {hasFetched ? 'History Loaded' : 'Load Payment History'}
                </Button>

                {isLoading && !hasFetched && (
                    <div className="flex justify-center items-center py-8">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                
                {hasFetched && (
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
                                            <TableCell>
                                                <div className="font-medium flex items-center gap-2">
                                                    {p.tokensPurchased > 0 ? (
                                                        `Purchased ${p.tokensPurchased} Tokens`
                                                    ) : (
                                                        <>
                                                        <Heart className="h-4 w-4 text-red-500"/>
                                                        Donation
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">${p.amount.toFixed(2)} {p.currency}</TableCell>
                                            <TableCell className="text-muted-foreground">{p.orderId}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : <p className="text-center text-muted-foreground py-8">No payment history found.</p>
                )}
            </CardContent>
        </Card>
    )
}

function BuddiesSection() {
    const { user, userProfile, fetchUserProfile } = useUserData();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [buddiesDetails, setBuddiesDetails] = useState<UserProfile[]>([]);

    useEffect(() => {
        const fetchBuddiesDetails = async () => {
            if (userProfile?.buddies && userProfile.buddies.length > 0) {
                const buddiesQuery = query(collection(db, 'users'), where('__name__', 'in', userProfile.buddies));
                const snapshot = await getDocs(buddiesQuery);
                const details = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
                setBuddiesDetails(details);
            } else {
                setBuddiesDetails([]);
            }
        };
        fetchBuddiesDetails();
    }, [userProfile?.buddies]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        const result = await findUserByEmail(searchTerm);
        setSearchResults(result as UserProfile | null);
        setIsSearching(false);
    };

    const handleSendRequest = async (toEmail: string) => {
        if (!user || !user.displayName || !user.email) return;
        const result = await sendBuddyRequest({ uid: user.uid, name: user.displayName, email: user.email }, toEmail);
        if (result.success) {
            toast({ title: "Request Sent!", description: `Your buddy request to ${toEmail} has been sent.` });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };
    
    const handleAcceptRequest = async (request: BuddyRequest) => {
        if (!user || !user.displayName) return;
        const result = await acceptBuddyRequest({uid: user.uid, name: user.displayName}, request);
        if (result.success) {
            toast({ title: 'Buddy Added!', description: `You are now buddies with ${request.fromName}.`});
            fetchUserProfile(); // Re-fetch to update lists
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };
    
    const handleDeclineRequest = async (request: BuddyRequest) => {
        if (!user) return;
        const result = await declineBuddyRequest(user.uid, request);
        if (result.success) {
            toast({ title: 'Request Declined' });
            fetchUserProfile();
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };

    const handleRemoveBuddy = async (buddyId: string) => {
        if (!user) return;
        const result = await removeBuddy(user.uid, buddyId);
        if (result.success) {
            toast({ title: "Buddy Removed" });
            fetchUserProfile();
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Find New Buddies</CardTitle>
                    <CardDescription>
                        Add a user by searching for their email. Once they accept your request, you can use the Buddy Alert button (the triangle icon) in the sidebar to send them your location.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input type="email" placeholder="Enter user's email" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Button type="submit" disabled={isSearching}>{isSearching ? <LoaderCircle className="animate-spin" /> : <Search />}</Button>
                    </form>
                    {searchResults && (
                        <div className="mt-4 p-4 border rounded-lg flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{searchResults.name}</p>
                                <p className="text-sm text-muted-foreground">{searchResults.email}</p>
                            </div>
                            <Button size="sm" onClick={() => handleSendRequest(searchResults.email)}><UserPlus className="mr-2" /> Add Buddy</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {userProfile?.buddyRequests && userProfile.buddyRequests.length > 0 && (
                 <Card>
                    <CardHeader><CardTitle>Incoming Requests ({userProfile.buddyRequests.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {userProfile.buddyRequests.map(req => (
                            <div key={req.fromUid} className="p-3 border rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="font-semibold">{req.fromName}</p>
                                    <p className="text-sm text-muted-foreground">{req.fromEmail}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="icon" variant="outline" onClick={() => handleAcceptRequest(req)}><UserCheck className="text-green-600" /></Button>
                                    <Button size="icon" variant="outline" onClick={() => handleDeclineRequest(req)}><XCircle className="text-red-600" /></Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

             <Card>
                <CardHeader><CardTitle>Your Buddies ({buddiesDetails.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    {buddiesDetails.length > 0 ? buddiesDetails.map(buddy => (
                         <div key={buddy.id} className="p-3 border rounded-lg flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{buddy.name}</p>
                                <p className="text-sm text-muted-foreground">{buddy.email}</p>
                            </div>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="destructive"><UserMinus className="mr-2" /> Remove</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Remove {buddy.name}?</AlertDialogTitle>
                                        <AlertDialogDescription>This will remove them from your buddy list. This action does not affect their buddy list.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleRemoveBuddy(buddy.id!)}>Confirm</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )) : <p className="text-muted-foreground text-center py-4">You haven't added any buddies yet.</p>}
                </CardContent>
            </Card>

        </div>
    )
}


export default function ProfilePage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState('buddies');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <MainHeader title="My Account" description="Manage settings and track your history." />
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="buddies">Buddies</TabsTrigger>
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="wallet">Token Wallet</TabsTrigger>
                    <TabsTrigger value="billing">Payment History</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="mt-6">
                    <ProfileSection />
                </TabsContent>
                <TabsContent value="buddies" className="mt-6">
                    <BuddiesSection />
                </TabsContent>
                 <TabsContent value="wallet" className="mt-6">
                    <TokenWalletCard />
                </TabsContent>
                 <TabsContent value="billing" className="mt-6">
                    <PaymentHistorySection />
                </TabsContent>
            </Tabs>
        </div>
    );
}
