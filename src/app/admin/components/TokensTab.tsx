
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

import { getTokenAnalytics, getTokenLedger, type TokenLedgerEntry, type TokenAnalytics } from '@/services/ledger';
import { clearTokenLedger, issueTokens } from '@/actions/ledgerAdmin';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { LoaderCircle, PlusCircle, MinusCircle, Banknote, Send, Search, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';

function IssueTokensContent({ onIssueSuccess }: { onIssueSuccess: () => void }) {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formState, setFormState] = useState({
        email: '',
        amount: '' as number | '',
        reason: 'Admin Issuance',
        description: 'Manual token grant by administrator.'
    });

    const handleIssueTokens = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Error', description: 'Admin user not found.' });
            return;
        }

        const { email, amount, reason, description } = formState;

        if (!email || !amount || amount <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please provide a valid email and a positive amount.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await issueTokens({ 
                email, 
                amount: Number(amount), 
                reason, 
                description,
                adminUser: { uid: user.uid, email: user.email }
             });

            if (result.success) {
                toast({ title: 'Success', description: `Successfully issued ${amount} tokens to ${email}.` });
                setFormState({ email: '', amount: '', reason: 'Admin Issuance', description: 'Manual token grant by administrator.' });
                onIssueSuccess(); // Callback to refresh parent component data
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (error) {
            
            toast({ variant: 'destructive', title: 'Client Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2"/> Issue Tokens</Button>
            </DialogTrigger>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Issue Tokens to a User</DialogTitle>
                    <DialogDescription>Manually grant tokens for rewards, customer support, or other reasons.</DialogDescription>
                </DialogHeader>
                 <form onSubmit={handleIssueTokens}>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="issue-email">Recipient Email</Label>
                            <Input id="issue-email" type="email" value={formState.email} onChange={e => setFormState(p => ({ ...p, email: e.target.value }))} placeholder="user@example.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="issue-amount">Amount</Label>
                            <Input id="issue-amount" type="number" value={formState.amount} onChange={e => setFormState(p => ({...p, amount: Number(e.target.value) }))} placeholder="e.g., 100" required min="1" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="issue-reason">Reason (for Transaction Log)</Label>
                            <Input id="issue-reason" value={formState.reason} onChange={e => setFormState(p => ({ ...p, reason: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="issue-description">Description (for Transaction Log)</Label>
                            <Textarea id="issue-description" value={formState.description} onChange={e => setFormState(p => ({ ...p, description: e.target.value }))} />
                        </div>
                    </div>
                     <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm &amp; Issue Tokens
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


export default function TokensTab() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
    const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    const getReasonText = (log: TokenLedgerEntry) => {
        if (log.reason) return log.reason;
        if (log.actionType === 'admin_issue') return 'Admin Issue';
        switch (log.actionType) {
            case 'purchase': return 'Token Purchase';
            case 'signup_bonus': return 'Signup Bonus';
            case 'referral_bonus': return 'Referral Bonus';
            case 'practice_earn': return 'Practice Reward';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Sync Online Usage';
            case 'p2p_transfer': return 'Peer Transfer';
            case 'sync_online_refund': return 'Sync Online Refund';
            case 'language_pack_download': return 'Language Pack Download';
            case 'save_phrase_spend': return 'Saved Phrases for Offline';
            default: return 'Prep Your Vibe';
        }
    };
    
    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const fetchData = useCallback(async (searchQuery = '') => {
        if (!auth.currentUser) return;

        setIsSearching(true);
        setHasSearched(true);
        
        try {
            const [analyticsData, ledgerData] = await Promise.all([
                getTokenAnalytics(),
                getTokenLedger(searchQuery)
            ]);
            setAnalytics(analyticsData);
            setLedger(ledgerData);
        } catch (err: any) {
             
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not fetch token data.' });
        } finally {
            setIsLoading(false);
            setIsSearching(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        getTokenAnalytics().then(setAnalytics).finally(() => setIsLoading(false));
    }, [user]);

    const downloadCsv = () => {
        if (ledger.length === 0) return;

        const headers = ["ID", "Date", "From/To", "QTY", "Reason", "Description"];
        const rows = ledger.map((log) => [
            log.id,
            format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
            getFromToCell(log),
            log.tokenChange,
            getReasonText(log),
            log.description + (log.duration ? ` (${formatDuration(log.duration)})` : '')
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "token_ledger.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

     const handleClearLedger = async () => {
        setIsDeleting(true);
        const result = await clearTokenLedger();
        if (result.success) {
            toast({ title: "Success", description: "Token ledger and all user balances have been reset." });
            await fetchData(); // Refresh data
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsDeleting(false);
    }

    const getFromToCell = (log: TokenLedgerEntry) => {
        if (log.actionType === 'admin_issue' && log.fromUserEmail) {
            return `From: ${log.fromUserEmail}\nTo: ${log.userEmail}`;
        }
         if (log.actionType === 'p2p_transfer') {
             if (log.tokenChange < 0) { // This is the sender
                 return `From: ${log.userEmail}\nTo: ${log.toUserEmail}`;
             } else { // This is the receiver
                 return `From: ${log.fromUserEmail}\nTo: ${log.userEmail}`;
             }
        }
        return log.userEmail;
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!analytics) {
        return <p>No token data available.</p>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Token Economy</CardTitle>
                <CardDescription>An overview of token distribution and acquisition.</CardDescription>
            </CardHeader>
            <CardContent>
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Banknote/> Total Tokens In System</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold">{analytics.totalTokensInSystem.toLocaleString()}</div>
                        <p className="text-sm text-muted-foreground">This is the sum of all tokens ever purchased or awarded.</p>
                    </CardContent>
                </Card>
                <Tabs defaultValue="ledger">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="ledger">Ledger</TabsTrigger>
                        <TabsTrigger value="issue">Issue Tokens</TabsTrigger>
                        <TabsTrigger value="acquired">Acquired</TabsTrigger>
                        <TabsTrigger value="distribution">Distribution</TabsTrigger>
                        <TabsTrigger value="p2p">P2P Transfers</TabsTrigger>
                    </TabsList>
                    <TabsContent value="ledger" className="py-4">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle>Token Ledger</CardTitle>
                                        <CardDescription>A log of all token transactions in the system.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button onClick={downloadCsv} variant="outline" size="sm" disabled={ledger.length === 0}>
                                            <Download className="mr-2 h-4 w-4" />
                                            CSV
                                        </Button>
                                         <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isDeleting}>
                                                    {isDeleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                                    Clear Ledger
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Clear Entire Token Economy?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action is irreversible. It will permanently delete the token transaction history for <strong className="text-destructive">ALL</strong> users and reset every user's token balance to <strong className="text-destructive">ZERO</strong>.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleClearLedger} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                        Confirm &amp; Delete All
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <form className="relative pt-2" onSubmit={(e) => { e.preventDefault(); fetchData(searchTerm); }}>
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by email or use * for all"
                                        className="pl-10"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    <Button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 h-8">Search</Button>
                                </form>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-md min-h-[200px] mt-6">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>#</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>From/To</TableHead>
                                                <TableHead className="text-right">QTY</TableHead>
                                                <TableHead>Reason</TableHead>
                                                <TableHead>Description</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isSearching ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                         <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : ledger.length > 0 ? (
                                                ledger.map((log) => (
                                                <TableRow key={log.id}>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-xs text-muted-foreground">{String(ledger.length - ledger.findIndex(l => l.id === log.id)).padStart(5, '0')}</span>
                                                            <span className="font-mono text-[10px] text-muted-foreground/60 truncate" title={log.id}>{log.id}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{format(log.timestamp, 'd MMM yyyy, HH:mm')}</TableCell>
                                                    <TableCell className="whitespace-pre-line">
                                                        <Link href={`/admin/${log.userId}`} className="text-primary underline hover:text-primary/80">
                                                            {getFromToCell(log)}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell className={`text-right font-medium ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>{getReasonText(log)}</TableCell>
                                                    <TableCell>
                                                        {log.description}
                                                        {log.duration && ` (${formatDuration(log.duration)})`}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                        {hasSearched ? 'No logs match your search.' : 'Enter a search term to begin.'}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="issue" className="py-4">
                        <IssueTokensContent onIssueSuccess={() => fetchData(searchTerm)} />
                    </TabsContent>
                    <TabsContent value="acquired" className="py-4">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><PlusCircle className="text-green-500" /> Tokens Acquired</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between"><span>Purchased:</span> <span className="font-bold">{analytics.purchased.toLocaleString()}</span></div>
                                <Separator />
                                <div className="flex justify-between font-bold text-lg"><span>Total In:</span> <span>{analytics.purchased.toLocaleString()}</span></div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="distribution" className="py-4">
                         <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><MinusCircle className="text-red-500" /> Token Distribution (Free)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between"><span>Admin-Issued:</span> <span className="font-bold">{analytics.adminIssued.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Signup Bonuses:</span> <span className="font-bold">{analytics.signupBonus.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Referral Bonuses:</span> <span className="font-bold">{analytics.referralBonus.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Practice Rewards:</span> <span className="font-bold">{analytics.practiceEarn.toLocaleString()}</span></div>
                                <Separator />
                                <div className="flex justify-between font-bold text-lg"><span>Total Distributed:</span> <span>{analytics.totalAwarded.toLocaleString()}</span></div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                     <TabsContent value="p2p" className="py-4">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Send className="text-blue-500" /> Peer-to-Peer Transfers</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between font-bold text-lg"><span>Total Volume Transferred:</span> <span>{analytics.p2pTotalVolume.toLocaleString()}</span></div>
                                <p className="text-sm text-muted-foreground">This is the total volume of tokens transferred between users, indicating internal economy activity.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
