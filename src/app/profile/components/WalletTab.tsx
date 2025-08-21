
"use client";

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserData } from '@/context/UserDataContext';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import type { TransactionLog } from '@/lib/types';
import { transferTokensAction } from '@/actions/ledger';
import BuyTokens from '@/components/BuyTokens';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoaderCircle, Wallet, Coins, Send, History } from 'lucide-react';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';


function TokenHistoryDialog() {
    const [user] = useAuthState(auth);
    const [transactions, setTransactions] = useState<(TransactionLog & { id: string })[]>([]);
    const [isLoading, setIsLoading] = useState(true);

     const getActionText = (log: TransactionLog) => {
        if (log.reason) return log.reason;
        if (log.actionType === 'p2p_transfer') {
            return log.tokenChange > 0 ? `Received from ${log.fromUserEmail}` : `Sent to ${log.toUserEmail}`;
        }
        if (log.actionType === 'sync_online_refund') return 'Voice Room Refund';
        
        switch (log.actionType) {
            case 'admin_issue': return 'Admin Issuance';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Voice Room Usage';
            case 'practice_earn': return 'Practice Reward';
            case 'signup_bonus': return 'Welcome Bonus';
            case 'purchase': return 'Token Purchase';
            case 'referral_bonus': return 'Referral Bonus';
            case 'language_pack_download': return 'Language Pack Download';
            case 'infohub_intel': return 'InfoHub Intel';
            case 'save_phrase_spend': return 'Saved Phrases for Offline';
            case 'transcript_generation': return 'Room Transcript';
            case 'eco_footprint_spend': return 'Eco-Footprint Calc';
            case 'transport_intel': return 'Transport Intel';
            default: return 'Prep Your Vibe';
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
                                        <TableHead className="hidden md:table-cell">#</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="hidden md:table-cell">Reason</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((log, index) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="hidden md:table-cell">
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-xs text-muted-foreground">{String(transactions.length - index).padStart(5, '0')}</span>
                                                    <span className="font-mono text-[10px] text-muted-foreground/60 truncate" title={log.id}>{log.id}</span>
                                                </div>
                                            </TableCell>
                                             <TableCell>
                                                <div className="font-medium">{getActionText(log)}</div>
                                                <div className="text-xs text-muted-foreground md:hidden">
                                                    {log.description}
                                                    {log.duration && ` (${formatDuration(log.duration)})`}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{log.timestamp ? format((log.timestamp as Timestamp).toDate(), 'd MMM yyyy, HH:mm') : 'N/A'}</div>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell max-w-xs truncate">
                                                 {log.description}
                                                 {log.duration && ` (${formatDuration(log.duration)})`}
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange.toLocaleString()}
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

export default function WalletTab() {
    const { userProfile } = useUserData();
    const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || '';

    return (
        <PayPalScriptProvider options={{ "clientId": PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
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
        </PayPalScriptProvider>
    );
}
