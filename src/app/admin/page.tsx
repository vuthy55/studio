
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, where, orderBy, documentId } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Shield, User as UserIcon, ArrowRight, Save, Search, Award, DollarSign, LineChart, Banknote, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppSettings, updateAppSettings, type AppSettings } from '@/services/settings';
import { Separator } from '@/components/ui/separator';
import { getFinancialLedger, addLedgerEntry, type FinancialLedgerEntry, getLedgerAnalytics, getTokenAnalytics, type TokenAnalytics, findUserByEmail, getTokenLedger, type TokenLedgerEntry, getFinancialLedger2, addLedgerEntry2, getLedgerAnalytics2, findUserByEmail2, getTokenAnalytics2, getTokenLedger2 } from '@/services/ledger';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';


interface UserWithId extends UserProfile {
    id: string;
}

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}


function UsersTabContent() {
    const router = useRouter();
    const [users, setUsers] = useState<UserWithId[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

     const fetchUsers = useCallback(async (search = '') => {
        const normalizedSearch = search.toLowerCase().trim();

        if (!normalizedSearch) {
            setUsers([]);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        setHasSearched(true);
        
        try {
            const usersRef = collection(db, 'users');
            
            // Query for email
            const emailQuery = query(usersRef, 
                where("searchableEmail", ">=", normalizedSearch),
                where("searchableEmail", "<=", normalizedSearch + '\uf8ff')
            );
            
            // Query for name
            const nameQuery = query(usersRef,
                where("searchableName", ">=", normalizedSearch),
                where("searchableName", "<=", normalizedSearch + '\uf8ff')
            );
            
            const [emailSnapshot, nameSnapshot] = await Promise.all([
                getDocs(emailQuery),
                getDocs(nameQuery),
            ]);

            const foundUsersMap = new Map<string, UserWithId>();

            const processSnapshot = (snapshot: any) => {
                 snapshot.docs.forEach((doc: any) => {
                    if (!foundUsersMap.has(doc.id)) {
                        foundUsersMap.set(doc.id, { id: doc.id, ...doc.data() } as UserWithId);
                    }
                });
            }

            processSnapshot(emailSnapshot);
            processSnapshot(nameSnapshot);
            
            const combinedUsers = Array.from(foundUsersMap.values());

            setUsers(combinedUsers);

        } catch (error: any) {
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                console.error("FULL FIREBASE ERROR - You probably need to create an index. Look for a URL in this error message to create it automatically:", error);
            } else {
                 toast({ 
                    variant: "destructive", 
                    title: "Error Fetching Users", 
                    description: "Could not fetch users. Check the console for details." 
                });
            }
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        // Clear search results if the debounced term is empty
        if (!debouncedSearchTerm) {
            setUsers([]);
            setHasSearched(false);
            return;
        }
        fetchUsers(debouncedSearchTerm);
    }, [debouncedSearchTerm, fetchUsers]);

    const handleRowClick = (userId: string) => {
        router.push(`/admin/${userId}`);
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Search for a user by their name or email address.</CardDescription>
                 <div className="relative pt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or email..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md min-h-[200px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="hidden sm:table-cell">Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                         <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : users.length > 0 ? (
                                users.map((u) => (
                                    <TableRow key={u.id} onClick={() => handleRowClick(u.id)} className="cursor-pointer">
                                        <TableCell className="hidden sm:table-cell font-medium">{u.name || 'N/A'}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>
                                            {u.role === 'admin' ? 
                                                <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                                <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ))
                             ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        {hasSearched ? 'No users found.' : 'Enter a user\'s name or email to begin your search.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function SettingsTabContent() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<Partial<AppSettings>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getAppSettings().then(data => {
            setSettings(data);
            setIsLoading(false);
        });
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateAppSettings(settings);
            toast({ title: "Success", description: "Application settings have been updated." });
        } catch (error: any) {
            console.error("Error saving settings:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not save settings." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setSettings(prev => ({...prev, [id]: Number(value) }));
    };

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
                <CardTitle>App Settings</CardTitle>
                <CardDescription>Manage the token economy and other application-wide settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {/* Column 1: Rewards & Freebies */}
                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><Award className="text-primary"/> Rewards & Freebies</h3>
                         <Separator />
                        <div className="space-y-2">
                            <Label htmlFor="signupBonus">Signup Bonus</Label>
                            <Input id="signupBonus" type="number" value={settings.signupBonus ?? ''} onChange={handleInputChange} placeholder="e.g., 100" />
                            <p className="text-sm text-muted-foreground">Tokens a new user gets on signup.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="referralBonus">Referral Bonus</Label>
                            <Input id="referralBonus" type="number" value={settings.referralBonus ?? ''} onChange={handleInputChange} placeholder="e.g., 150" />
                            <p className="text-sm text-muted-foreground">Tokens a user gets for a successful referral.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="practiceReward">Practice Reward</Label>
                            <Input id="practiceReward" type="number" value={settings.practiceReward ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens earned for mastering a phrase.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="practiceThreshold">Practice Threshold</Label>
                            <Input id="practiceThreshold" type="number" value={settings.practiceThreshold ?? ''} onChange={handleInputChange} placeholder="e.g., 3" />
                            <p className="text-sm text-muted-foreground">Successful practices to earn reward.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="freeSyncLiveMinutes">Free Sync Live Minutes</Label>
                            <Input id="freeSyncLiveMinutes" type="number" value={settings.freeSyncLiveMinutes ?? ''} onChange={handleInputChange} placeholder="e.g., 10" />
                            <p className="text-sm text-muted-foreground">Free monthly minutes for Sync Live.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="freeSyncOnlineMinutes">Free Sync Online Minutes</Label>
                            <Input id="freeSyncOnlineMinutes" type="number" value={settings.freeSyncOnlineMinutes ?? ''} onChange={handleInputChange} placeholder="e.g., 10" />
                            <p className="text-sm text-muted-foreground">Free monthly minutes for Sync Online.</p>
                        </div>
                    </div>

                    {/* Column 2: Costs & Limits */}
                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="text-primary"/> Costs & Limits</h3>
                         <Separator />
                        <div className="space-y-2">
                            <Label htmlFor="translationCost">Translation Cost</Label>
                            <Input id="translationCost" type="number" value={settings.translationCost ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens charged for each live translation.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="costPerSyncLiveMinute">Sync Live Cost (per minute)</Label>
                            <Input id="costPerSyncLiveMinute" type="number" value={settings.costPerSyncLiveMinute ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens per minute for the 1-on-1 Sync Live feature.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="costPerSyncOnlineMinute">Sync Online Cost (per minute)</Label>
                            <Input id="costPerSyncOnlineMinute" type="number" value={settings.costPerSyncOnlineMinute ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens per minute for Sync Online group rooms.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="maxUsersPerRoom">Max Users per Sync Room</Label>
                            <Input id="maxUsersPerRoom" type="number" value={settings.maxUsersPerRoom ?? ''} onChange={handleInputChange} placeholder="e.g., 5" />
                            <p className="text-sm text-muted-foreground">Max users in a Sync Online room.</p>
                        </div>
                    </div>
                 </div>

                 <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Settings
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function FinancialTabContent() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [analytics, setAnalytics] = useState({ revenue: 0, expenses: 0, net: 0 });
    const [userMap, setUserMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false);

    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
    const [detailsDialogContent, setDetailsDialogContent] = useState<{ title: string; data: FinancialLedgerEntry[] }>({ title: '', data: [] });

    const [formState, setFormState] = useState({
        description: '',
        amount: '' as number | '',
        userEmail: '',
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

    const openDetailsDialog = (type: 'revenue' | 'expense') => {
        const data = ledger.filter(item => item.type === type);
        const title = type === 'revenue' ? 'Revenue Details' : 'Expense Details';
        setDetailsDialogContent({ title, data });
        setIsDetailsDialogOpen(true);
    };

    const fetchData = useCallback(async () => {
        if (!auth.currentUser) {
            setLedger([]);
            setAnalytics({ revenue: 0, expenses: 0, net: 0 });
            setUserMap({});
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [ledgerData, analyticsData] = await Promise.all([
                getFinancialLedger(),
                getLedgerAnalytics()
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
                setUserMap(fetchedUserMap);
            }
        } catch (error) {
            console.error("Error fetching financial data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch financial data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData, user]); // Refetch when user logs in/out

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
                source: source || 'manual',
                userId: userId,
            };

            if (link) {
                newEntry.link = link;
            }

            await addLedgerEntry(newEntry);

            toast({ title: 'Success', description: `${type.charAt(0).toUpperCase() + type.slice(1)} added to the ledger.` });
            
            setIsExpenseDialogOpen(false);
            setIsRevenueDialogOpen(false);
            await fetchData();

        } catch (error) {
            console.error(`Error adding ${type}:`, error);
            toast({ variant: 'destructive', title: 'Error', description: `Could not add ${type}.` });
        } finally {
            setIsSubmitting(false);
        }
    };
    
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
                                            <Input id="revenue-source" value={formState.source} onChange={(e) => setFormState(prev => ({...prev, source: e.target.value}))} placeholder="e.g., manual" />
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
                                            <Input id="expense-source" value={formState.source} onChange={(e) => setFormState(prev => ({...prev, source: e.target.value}))} placeholder="e.g., manual" />
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
                             <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4 hover:bg-muted rounded-lg cursor-pointer" onClick={() => openDetailsDialog('revenue')}>
                                 <div className="flex items-center text-sm font-medium text-muted-foreground">
                                    <PlusCircle className="h-4 w-4 mr-1 text-green-500" />
                                    Total Revenue:
                                 </div>
                                 <div className="text-2xl font-bold text-green-600">${analytics.revenue.toFixed(2)}</div>
                            </div>
                            
                            {/* Total Expenses */}
                            <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4 hover:bg-muted rounded-lg cursor-pointer" onClick={() => openDetailsDialog('expense')}>
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
                            {ledger.length > 0 ? (
                                ledger.map((item, index) => {
                                    const runningNumber = String(ledger.length - index).padStart(5, '0');
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-muted-foreground">{runningNumber}</TableCell>
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
                                    <TableCell colSpan={6} className="h-24 text-center">No financial records found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

             {/* Details Dialog */}
            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{detailsDialogContent.title}</DialogTitle>
                        <DialogDescription>A detailed list of all transactions for this category.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
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
                                {detailsDialogContent.data.map((item, index) => (
                                    <TableRow key={item.id}>
                                         <TableCell className="font-mono text-xs text-muted-foreground">
                                           {String(detailsDialogContent.data.length - index).padStart(5, '0')}
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
                                                <span className="text-xs text-muted-foreground capitalize">{item.source}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{item.source === 'paypal' ? `Token Purchase: ${item.orderId}` : item.description}</TableCell>
                                        <TableCell>{item.userId ? userMap[item.userId] || 'User' : 'System'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

        </Card>
    )
}

function TokensTabContent() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
    const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const getReasonText = (log: TokenLedgerEntry) => {
        switch (log.actionType) {
            case 'purchase': return 'Token Purchase';
            case 'signup_bonus': return 'Signup Bonus';
            case 'referral_bonus': return 'Referral Bonus';
            case 'practice_earn': return 'Practice Reward';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Sync Online Usage';
            default: return 'Unknown Action';
        }
    };
    
    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

     const fetchData = useCallback(async () => {
        if (!auth.currentUser) {
            setAnalytics(null);
            setLedger([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [analyticsData, ledgerData] = await Promise.all([
                getTokenAnalytics(),
                getTokenLedger()
            ]);
            setAnalytics(analyticsData);
            setLedger(ledgerData);
        } catch (err: any) {
             console.error("Error fetching token data:", err);
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not fetch token data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData, user]); // Refetch when user logs in/out
    
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
            <CardContent className="space-y-6">
                 <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Banknote/> Total Tokens</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.totalTokensInSystem.toLocaleString()}</div>
                        </CardContent>
                    </Card>
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
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MinusCircle className="text-red-500" /> Tokens Distributed</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between"><span>Signup Bonuses:</span> <span className="font-bold">{analytics.signupBonus.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Referral Bonuses:</span> <span className="font-bold">{analytics.referralBonus.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Practice Rewards:</span> <span className="font-bold">{analytics.practiceEarn.toLocaleString()}</span></div>
                            <Separator />
                            <div className="flex justify-between font-bold text-lg"><span>Total Out (Free):</span> <span>{analytics.totalAwarded.toLocaleString()}</span></div>
                        </CardContent>
                    </Card>
                </div>
                 <div className="border rounded-md min-h-[200px]">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>To/From</TableHead>
                                <TableHead className="text-right">QTY</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ledger.map((log, index) => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{String(ledger.length - index).padStart(5, '0')}</TableCell>
                                    <TableCell>{format(log.timestamp, 'd MMM yyyy, HH:mm')}</TableCell>
                                    <TableCell>
                                        <Link href={`/admin/${log.userId}`} className="text-primary underline hover:text-primary/80">
                                            {log.userEmail}
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
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

function FinancialTabContent2() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [analytics, setAnalytics] = useState({ revenue: 0, expenses: 0, net: 0 });
    const [userMap, setUserMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false);

    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
    const [detailsDialogContent, setDetailsDialogContent] = useState<{ title: string; data: FinancialLedgerEntry[] }>({ title: '', data: [] });

    const [formState, setFormState] = useState({
        description: '',
        amount: '' as number | '',
        userEmail: '',
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

    const openDetailsDialog = (type: 'revenue' | 'expense') => {
        const data = ledger.filter(item => item.type === type);
        const title = type === 'revenue' ? 'Revenue Details' : 'Expense Details';
        setDetailsDialogContent({ title, data });
        setIsDetailsDialogOpen(true);
    };

    const fetchData = useCallback(async () => {
        if (!auth.currentUser) {
            setLedger([]);
            setAnalytics({ revenue: 0, expenses: 0, net: 0 });
            setUserMap({});
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [ledgerData, analyticsData] = await Promise.all([
                getFinancialLedger2(),
                getLedgerAnalytics2()
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
                setUserMap(fetchedUserMap);
            }
        } catch (error) {
            console.error("Error fetching financial data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch financial data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData, user]); // Refetch when user logs in/out

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
                const foundUser = await findUserByEmail2(userEmail);
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
                source: source || 'manual',
                userId: userId,
            };

            if (link) {
                newEntry.link = link;
            }

            await addLedgerEntry2(newEntry);

            toast({ title: 'Success', description: `${type.charAt(0).toUpperCase() + type.slice(1)} added to the ledger.` });
            
            setIsExpenseDialogOpen(false);
            setIsRevenueDialogOpen(false);
            await fetchData();

        } catch (error) {
            console.error(`Error adding ${type}:`, error);
            toast({ variant: 'destructive', title: 'Error', description: `Could not add ${type}.` });
        } finally {
            setIsSubmitting(false);
        }
    };
    
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
                        <CardTitle>Financial Ledger 2</CardTitle>
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
                                            <Input id="revenue-source" value={formState.source} onChange={(e) => setFormState(prev => ({...prev, source: e.target.value}))} placeholder="e.g., manual" />
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
                                            <Input id="expense-source" value={formState.source} onChange={(e) => setFormState(prev => ({...prev, source: e.target.value}))} placeholder="e.g., manual" />
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
                             <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4 hover:bg-muted rounded-lg cursor-pointer" onClick={() => openDetailsDialog('revenue')}>
                                 <div className="flex items-center text-sm font-medium text-muted-foreground">
                                    <PlusCircle className="h-4 w-4 mr-1 text-green-500" />
                                    Total Revenue:
                                 </div>
                                 <div className="text-2xl font-bold text-green-600">${analytics.revenue.toFixed(2)}</div>
                            </div>
                            
                            {/* Total Expenses */}
                            <div className="flex flex-col items-center justify-center p-2 gap-1 md:flex-row md:gap-4 hover:bg-muted rounded-lg cursor-pointer" onClick={() => openDetailsDialog('expense')}>
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
                            {ledger.length > 0 ? (
                                ledger.map((item, index) => {
                                    const runningNumber = String(ledger.length - index).padStart(5, '0');
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-muted-foreground">{runningNumber}</TableCell>
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
                                    <TableCell colSpan={6} className="h-24 text-center">No financial records found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

             {/* Details Dialog */}
            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{detailsDialogContent.title}</DialogTitle>
                        <DialogDescription>A detailed list of all transactions for this category.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
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
                                {detailsDialogContent.data.map((item, index) => (
                                    <TableRow key={item.id}>
                                         <TableCell className="font-mono text-xs text-muted-foreground">
                                           {String(detailsDialogContent.data.length - index).padStart(5, '0')}
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
                                                <span className="text-xs text-muted-foreground capitalize">{item.source}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{item.source === 'paypal' ? `Token Purchase: ${item.orderId}` : item.description}</TableCell>
                                        <TableCell>{item.userId ? userMap[item.userId] || 'User' : 'System'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

        </Card>
    )
}

function TokensTabContent2() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
    const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const getReasonText = (log: TokenLedgerEntry) => {
        switch (log.actionType) {
            case 'purchase': return 'Token Purchase';
            case 'signup_bonus': return 'Signup Bonus';
            case 'referral_bonus': return 'Referral Bonus';
            case 'practice_earn': return 'Practice Reward';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Sync Online Usage';
            default: return 'Unknown Action';
        }
    };
    
    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

     const fetchData = useCallback(async () => {
        if (!auth.currentUser) {
            setAnalytics(null);
            setLedger([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [analyticsData, ledgerData] = await Promise.all([
                getTokenAnalytics2(),
                getTokenLedger2()
            ]);
            setAnalytics(analyticsData);
            setLedger(ledgerData);
        } catch (err: any) {
             console.error("Error fetching token data:", err);
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not fetch token data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData, user]); // Refetch when user logs in/out
    
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
                <CardTitle>Token Economy 2</CardTitle>
                <CardDescription>An overview of token distribution and acquisition.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Banknote/> Total Tokens</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.totalTokensInSystem.toLocaleString()}</div>
                        </CardContent>
                    </Card>
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
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MinusCircle className="text-red-500" /> Tokens Distributed</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between"><span>Signup Bonuses:</span> <span className="font-bold">{analytics.signupBonus.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Referral Bonuses:</span> <span className="font-bold">{analytics.referralBonus.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Practice Rewards:</span> <span className="font-bold">{analytics.practiceEarn.toLocaleString()}</span></div>
                            <Separator />
                            <div className="flex justify-between font-bold text-lg"><span>Total Out (Free):</span> <span>{analytics.totalAwarded.toLocaleString()}</span></div>
                        </CardContent>
                    </Card>
                </div>
                 <div className="border rounded-md min-h-[200px]">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>To/From</TableHead>
                                <TableHead className="text-right">QTY</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ledger.map((log, index) => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{String(ledger.length - index).padStart(5, '0')}</TableCell>
                                    <TableCell>{format(log.timestamp, 'd MMM yyyy, HH:mm')}</TableCell>
                                    <TableCell>
                                        <Link href={`/admin/${log.userId}`} className="text-primary underline hover:text-primary/80">
                                            {log.userEmail}
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
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default function AdminPage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);
    
    if (authLoading || !isClient) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <header className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
                  <p className="text-muted-foreground">Manage users and app settings.</p>
                </div>
            </header>
            
            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="settings">App Settings</TabsTrigger>
                    <TabsTrigger value="financial">Financial</TabsTrigger>
                    <TabsTrigger value="tokens">Tokens</TabsTrigger>
                    <TabsTrigger value="financial2">Financial 2</TabsTrigger>
                    <TabsTrigger value="tokens2">Tokens 2</TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="mt-6">
                    <UsersTabContent />
                </TabsContent>
                <TabsContent value="settings" className="mt-6">
                    <SettingsTabContent />
                </TabsContent>
                 <TabsContent value="financial" className="mt-6">
                    <FinancialTabContent />
                </TabsContent>
                <TabsContent value="tokens" className="mt-6">
                    <TokensTabContent />
                </TabsContent>
                 <TabsContent value="financial2" className="mt-6">
                    <FinancialTabContent2 />
                </TabsContent>
                <TabsContent value="tokens2" className="mt-6">
                    <TokensTabContent2 />
                </TabsContent>
            </Tabs>

        </div>
    );
}
