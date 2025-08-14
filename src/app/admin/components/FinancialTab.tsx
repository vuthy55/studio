
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, where, documentId } from 'firebase/firestore';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { getFinancialLedger, addLedgerEntry, type FinancialLedgerEntry, getLedgerAnalytics, findUserByEmail } from '@/services/ledger';
import { clearFinancialLedger } from '@/actions/ledgerAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { LoaderCircle, Search, Download, PlusCircle, MinusCircle, DollarSign, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';

export default function FinancialTab() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [analytics, setAnalytics] = useState({ revenue: 0, expenses: 0, net: 0 });
    const [userMap, setUserMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    
    const [formState, setFormState] = useState<{
        description: string;
        amount: number | '';
        userEmail: string;
        link: string;
        source: 'manual' | 'paypal' | 'paypal-donation';
    }>({
        description: '',
        amount: '',
        userEmail: user?.email || '',
        link: '',
        source: 'manual'
    });

    const resetForm = () => {
        setFormState({ description: '', amount: '', userEmail: user?.email || '', link: '', source: 'manual' });
    };

    const handleOpenRevenueDialog = () => {
        resetForm();
        setIsRevenueDialogOpen(true);
    };

    const handleOpenExpenseDialog = () => {
        resetForm();
        setIsExpenseDialogOpen(true);
    };

    const fetchData = useCallback(async (searchQuery = '') => {
        if (!auth.currentUser) return;
        
        setIsSearching(true);
        
        try {
            const [ledgerData, analyticsData] = await Promise.all([
                getFinancialLedger(searchQuery),
                getLedgerAnalytics() // Analytics should always be total, not filtered
            ]);
            setLedger(ledgerData);
            setAnalytics(analyticsData);

            const userIds = [...new Set(ledgerData.map(item => item.userId).filter(Boolean))] as string[];
            if (userIds.length > 0) {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where(documentId(), 'in', userIds));
                const userSnapshot = await getDocs(q);
                const fetchedUserMap: Record<string, string> = {};
                userSnapshot.forEach(doc => {
                    fetchedUserMap[doc.id] = doc.data().email || 'Unknown User';
                });
                setUserMap(prev => ({...prev, ...fetchedUserMap}));
            }
        } catch (error) {
            
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch financial data.' });
        } finally {
            setIsLoading(false);
            setIsSearching(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData('*');
    }, [fetchData]);
    

    const handleManualEntry = async (e: React.FormEvent, type: 'revenue' | 'expense') => {
        e.preventDefault();
        const { description, amount, userEmail, link, source } = formState;

        if (!description || !amount || amount <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please provide a valid description and amount.' });
            return;
        }

        setIsSubmitting(true);
        try {
            let userId: string | undefined = undefined;
            if (userEmail) {
                const foundUser = await findUserByEmail(userEmail);
                if (foundUser) {
                    userId = foundUser.id;
                } else {
                    toast({ variant: "destructive", title: "User Not Found", description: `No user found with email: ${userEmail}`});
                    setIsSubmitting(false);
                    return;
                }
            }
            
            const newEntry: Omit<FinancialLedgerEntry, 'id'> = {
                type,
                description,
                amount: Number(amount),
                timestamp: new Date(),
                source,
                userId: userId,
            };

            if (link) {
                newEntry.link = link;
            }

            await addLedgerEntry(newEntry);

            toast({ title: 'Success', description: `${type.charAt(0).toUpperCase() + type.slice(1)} added to the ledger.` });
            
            setIsExpenseDialogOpen(false);
            setIsRevenueDialogOpen(false);
            await fetchData(searchTerm || '*');

        } catch (error) {
            
            toast({ variant: 'destructive', title: 'Error', description: `Could not add ${type}.` });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const downloadCsv = () => {
        if (ledger.length === 0) return;
        const headers = ["ID", "Date", "Type", "Amount", "Source", "Description", "User Email", "Link"];
        const rows = ledger.map(item => [
            item.id,
            format(item.timestamp, 'yyyy-MM-dd HH:mm:ss'),
            item.type,
            item.amount,
            item.source || 'N/A',
            item.description,
            item.userId ? (userMap[item.userId] || item.userId) : 'System',
            item.link || 'N/A'
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "financial_ledger.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleClearLedger = async () => {
        setIsDeleting(true);
        const result = await clearFinancialLedger();
        if (result.success) {
            toast({ title: "Success", description: "Financial ledger has been cleared." });
            await fetchData(); // Refresh data
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsDeleting(false);
    }
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Financial Ledger</CardTitle>
                        <CardDescription>A record of all revenue and expenses.</CardDescription>
                    </div>
                     <div className="flex gap-2">
                        <Dialog open={isRevenueDialogOpen} onOpenChange={setIsRevenueDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={handleOpenRevenueDialog} variant="outline"><PlusCircle className="mr-2"/> Add Revenue</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add New Revenue</DialogTitle>
                                    <DialogDescription>Record a new incoming transaction.</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={(e) => handleManualEntry(e, 'revenue')}>
                                    <div className="py-4 space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="revenue-amount">Amount (USD)</Label>
                                            <Input id="revenue-amount" type="number" value={formState.amount} onChange={(e) => setFormState(prev => ({...prev, amount: Number(e.target.value)}))} placeholder="e.g., 100.00" required min="0.01" step="0.01" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="revenue-description">Description</Label>
                                            <Textarea id="revenue-description" value={formState.description} onChange={(e) => setFormState(prev => ({...prev, description: e.target.value}))} placeholder="e.g., Angel investment" required />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="revenue-source">Method</Label>
                                            <Select value={formState.source} onValueChange={(value) => setFormState(prev => ({...prev, source: value as 'manual' | 'paypal' | 'paypal-donation'}))}>
                                                <SelectTrigger id="revenue-source">
                                                    <SelectValue placeholder="Select method..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="manual">Manual</SelectItem>
                                                    <SelectItem value="paypal">PayPal</SelectItem>
                                                    <SelectItem value="paypal-donation">PayPal Donation</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="revenue-user-email">User Email (Optional)</Label>
                                            <Input id="revenue-user-email" type="email" value={formState.userEmail} onChange={(e) => setFormState(prev => ({...prev, userEmail: e.target.value}))} placeholder="user@example.com" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="revenue-link">Link (Optional)</Label>
                                            <Input id="revenue-link" type="url" value={formState.link} onChange={(e) => setFormState(prev => ({...prev, link: e.target.value}))} placeholder="https://example.com/transaction/123" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                            Add Revenue
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={handleOpenExpenseDialog}><PlusCircle className="mr-2"/> Add Expense</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add New Expense</DialogTitle>
                                    <DialogDescription>Record a new outgoing transaction.</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={(e) => handleManualEntry(e, 'expense')}>
                                    <div className="py-4 space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="expense-amount">Amount (USD)</Label>
                                            <Input id="expense-amount" type="number" value={formState.amount} onChange={(e) => setFormState(prev => ({...prev, amount: Number(e.target.value)}))} placeholder="e.g., 50.00" required min="0.01" step="0.01" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="expense-description">Description</Label>
                                            <Textarea id="expense-description" value={formState.description} onChange={(e) => setFormState(prev => ({...prev, description: e.target.value}))} placeholder="e.g., Monthly server costs" required />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="expense-source">Method</Label>
                                             <Select value={formState.source} onValueChange={(value) => setFormState(prev => ({...prev, source: value as 'manual' | 'paypal' | 'paypal-donation'}))}>
                                                <SelectTrigger id="expense-source">
                                                    <SelectValue placeholder="Select method..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="manual">Manual</SelectItem>
                                                    <SelectItem value="paypal">PayPal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="expense-user-email">User Email (Optional)</Label>
                                            <Input id="expense-user-email" type="email" value={formState.userEmail} onChange={(e) => setFormState(prev => ({...prev, userEmail: e.target.value}))} placeholder="user@example.com" />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="expense-link">Link (Optional)</Label>
                                            <Input id="expense-link" type="url" value={formState.link} onChange={(e) => setFormState(prev => ({...prev, link: e.target.value}))} placeholder="https://example.com/invoice/456" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                            Add Expense
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                     </div>
                </div>
                
                 <Card className="mt-4">
                    <CardContent className="p-4">
                         <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x">
                            {/* Total Revenue */}
                             <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4">
                                 <div className="flex items-center text-sm font-medium text-muted-foreground">
                                    <PlusCircle className="h-4 w-4 mr-1 text-green-500" />
                                    Total Revenue:
                                 </div>
                                 <div className="text-2xl font-bold text-green-600">${analytics.revenue.toFixed(2)}</div>
                            </div>
                            
                            {/* Total Expenses */}
                            <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4">
                                <div className="flex items-center text-sm font-medium text-muted-foreground">
                                    <MinusCircle className="h-4 w-4 mr-1 text-red-500" />
                                    Total Expenses:
                                 </div>
                                <div className="text-2xl font-bold text-red-600">${analytics.expenses.toFixed(2)}</div>
                            </div>

                            {/* Net Profit */}
                            <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4">
                                <div className="flex items-center text-sm font-medium text-muted-foreground">
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Net Profit:
                                </div>
                                <div className={`text-2xl font-bold ${analytics.net >= 0 ? 'text-foreground' : 'text-red-600'}`}>${analytics.net.toFixed(2)}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </CardHeader>
            <CardContent>
                 <form className="flex justify-between items-center mb-4" onSubmit={(e) => { e.preventDefault(); fetchData(searchTerm || '*'); }}>
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Search by email or use * for all"
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                     <div className="flex items-center gap-2 ml-4">
                        <Button type="submit" variant="secondary" size="sm" disabled={isSearching}>
                            {isSearching ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />}
                            Search
                        </Button>
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
                                    <AlertDialogTitle>Clear Financial Ledger?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action is irreversible and will permanently delete all entries in the central financial ledger (revenue and expenses). It will NOT affect individual user payment histories or token balances.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearLedger} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                        Confirm &amp; Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </form>
                 <div className="border rounded-md min-h-[200px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Type / Method</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>By</TableHead>
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
                                ledger.map((item, index) => {
                                    const runningNumber = String(ledger.length - index).padStart(5, '0');
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-xs text-muted-foreground">{runningNumber}</span>
                                                    <span className="font-mono text-[10px] text-muted-foreground/60 truncate" title={item.id}>{item.id}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{format(item.timestamp, 'd MMM yyyy, HH:mm')}</TableCell>
                                            <TableCell className={`text-right font-medium ${item.type === 'revenue' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.type === 'revenue' ? '+' : '-'}${item.amount.toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <Badge variant={item.type === 'revenue' ? 'default' : 'destructive'} className={`w-fit ${item.type === 'revenue' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {item.type}
                                                    </Badge>
                                                    
                                                     <span className="text-xs text-muted-foreground capitalize">
                                                        {item.source === 'manual' && item.link ? (
                                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 flex items-center gap-1">
                                                                {item.source} <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        ) : (
                                                            item.source
                                                        )}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {item.source === 'paypal' ? `Token Purchase: ${item.orderId}` : item.description}
                                            </TableCell>
                                            <TableCell>
                                                {item.userId ? (
                                                     <Link href={`/admin/${item.userId}`} className="text-primary underline hover:text-primary/80">
                                                        {userMap[item.userId] || item.userId}
                                                    </Link>
                                                ) : 'System'}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                       No records match your search. Use '*' for all.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
