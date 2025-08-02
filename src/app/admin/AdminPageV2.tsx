
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, where, orderBy, documentId, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Shield, User as UserIcon, ArrowRight, Save, Search, Award, DollarSign, LineChart, Banknote, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Trash2, FileText, Languages, FileSignature, Download, Send, Edit, AlertTriangle, BookUser, RadioTower, Users, Settings, Coins, MessageSquareQuote, Info, BellOff, Music, RefreshCw, LifeBuoy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppSettingsAction, updateAppSettingsAction, type AppSettings } from '@/actions/settings';
import { Separator } from '@/components/ui/separator';
import { getFinancialLedger, addLedgerEntry, type FinancialLedgerEntry, getLedgerAnalytics, getTokenAnalytics, type TokenAnalytics, findUserByEmail, getTokenLedger, type TokenLedgerEntry } from '@/services/ledger';
import { clearFinancialLedger, clearTokenLedger, issueTokens } from '@/actions/ledgerAdmin';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { Checkbox } from '@/components/ui/checkbox';
import { permanentlyDeleteRooms, setRoomEditability } from '@/actions/room';
import { deleteUsers, clearAllNotifications } from '@/actions/admin';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import MainHeader from '@/components/layout/MainHeader';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import AdminSOP from '@/components/marketing/AdminSOP';
import BackpackerMarketing from '@/components/marketing/BackpackerMarketing';
import MarketingRelease from '@/components/marketing/MarketingRelease';
import MarketingRelease2 from '@/components/marketing/MarketingRelease2';
import AudioPackGenerator from './AudioPackGenerator';
import FreeLanguagePacksManager from './FreeLanguagePacksManager';
import MarketingRelease3 from '@/components/marketing/MarketingRelease3';
import { getFeedbackSubmissions, type FeedbackSubmission } from '@/actions/feedback';
import Image from 'next/image';
import BetaTesterInfo from '@/components/marketing/BetaTesterInfo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { findUserByEmailAdmin } from '@/lib/firebase-utils';


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
        const trimmedSearch = search.trim();
        const normalizedSearch = trimmedSearch.toLowerCase();

        if (!trimmedSearch) {
            setUsers([]);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        setHasSearched(true);
        
        try {
            const usersRef = collection(db, 'users');
            let combinedUsers: UserWithId[] = [];

            if (trimmedSearch === '*') {
                // Wildcard search: fetch all users
                const allUsersQuery = query(usersRef, orderBy('email'));
                const allUsersSnapshot = await getDocs(allUsersQuery);
                combinedUsers = allUsersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
            } else {
                // Standard search by name or email
                const emailQuery = query(usersRef, 
                    where("searchableEmail", ">=", normalizedSearch),
                    where("searchableEmail", "<=", normalizedSearch + '\uf8ff')
                );
                
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
                
                combinedUsers = Array.from(foundUsersMap.values());
            }

            setUsers(combinedUsers);

        } catch (error: any) {
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                
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
                <CardDescription>Search by name/email, or use '*' to show all users.</CardDescription>
                 <div className="relative pt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, email, or use * for all"
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
                                        {hasSearched ? 'No users found.' : 'Enter a search term to begin.'}
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
        getAppSettingsAction().then(data => {
            setSettings(data);
            setIsLoading(false);
        });
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await updateAppSettingsAction(settings);
            if (result.success) {
                toast({ title: "Success", description: "Application settings have been updated." });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error || "Could not save settings." });
            }
        } catch (error: any) {
            
            toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        const isNumeric = !['infohubSources'].includes(id);
        setSettings(prev => ({...prev, [id]: isNumeric ? Number(value) : value }));
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
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
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
                            <Label htmlFor="translationCost">Translation / Save Cost</Label>
                            <Input id="translationCost" type="number" value={settings.translationCost ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens for one translation or saving one phrase offline.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="costPerSyncLiveMinute">Sync Live Cost (per minute)</Label>
                            <Input id="costPerSyncLiveMinute" type="number" value={settings.costPerSyncLiveMinute ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Tokens per minute for the 1-on-1 Sync Live feature.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="costPerSyncOnlineMinute">Sync Online Cost (per person, per minute)</Label>
                            <Input id="costPerSyncOnlineMinute" type="number" value={settings.costPerSyncOnlineMinute ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                            <p className="text-sm text-muted-foreground">Token cost for each person in a room for each minute of usage.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="maxUsersPerRoom">Max Users per Sync Room</Label>
                            <Input id="maxUsersPerRoom" type="number" value={settings.maxUsersPerRoom ?? ''} onChange={handleInputChange} placeholder="e.g., 5" />
                            <p className="text-sm text-muted-foreground">Max users in a Sync Online room.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="roomReminderMinutes">Room Reminder (minutes)</Label>
                            <Input id="roomReminderMinutes" type="number" value={settings.roomReminderMinutes ?? ''} onChange={handleInputChange} placeholder="e.g., 5" />
                            <p className="text-sm text-muted-foreground">Remind users N minutes before a room's booked time ends.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="transcriptCost" className="flex items-center gap-1.5"><FileSignature/> Transcript Cost</Label>
                            <Input id="transcriptCost" type="number" value={settings.transcriptCost ?? ''} onChange={handleInputChange} placeholder="e.g., 50" />
                            <p className="text-sm text-muted-foreground">One-time token cost to generate a raw meeting transcript.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="summaryTranslationCost" className="flex items-center gap-1.5"><Languages/> Summary Translation Cost</Label>
                            <Input id="summaryTranslationCost" type="number" value={settings.summaryTranslationCost ?? ''} onChange={handleInputChange} placeholder="e.g., 10" />
                            <p className="text-sm text-muted-foreground">Token cost to translate a summary into one language.</p>
                        </div>
                    </div>

                    {/* Column 3: AI & Language */}
                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><Music className="text-primary"/> AI & Language</h3>
                         <Separator />
                        <div className="space-y-2">
                            <Label htmlFor="languageUnlockCost">Language Unlock Cost</Label>
                            <Input id="languageUnlockCost" type="number" value={settings.languageUnlockCost ?? ''} onChange={handleInputChange} placeholder="e.g., 100" />
                            <p className="text-sm text-muted-foreground">Tokens to permanently unlock a language.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="infohubAiCost" className="flex items-center gap-1.5"><Info/> InfoHub AI Cost</Label>
                            <Input id="infohubAiCost" type="number" value={settings.infohubAiCost ?? ''} onChange={handleInputChange} placeholder="e.g., 10" />
                            <p className="text-sm text-muted-foreground">Tokens to get latest AI travel intel for one country.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="infohubSources" className="flex items-center gap-1.5"><LinkIcon/> InfoHub Sources</Label>
                            <Textarea 
                                id="infohubSources" 
                                value={settings.infohubSources ?? ''} 
                                onChange={handleInputChange} 
                                placeholder="https://..."
                                rows={4}
                            />
                            <p className="text-sm text-muted-foreground">Comma-separated list of URLs for the AI to scrape for InfoHub data.</p>
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
    const [isSearching, setIsSearching] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

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
        setHasSearched(true);
        
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
        if (!user) {
            setIsLoading(false);
            return;
        }
        getLedgerAnalytics().then(setAnalytics).finally(() => setIsLoading(false));
    }, [user]);
    

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
            await fetchData(searchTerm);

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
                                <Button><PlusCircle className="mr-2"/> Add Expense</Button>
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
                 <form className="flex justify-between items-center mb-4" onSubmit={(e) => { e.preventDefault(); fetchData(searchTerm); }}>
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
                                       {hasSearched ? "No records match your search." : "Enter a search term to begin."}
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

function TokensTabContent() {
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
        if (log.actionType === 'admin_issue') return log.reason || 'Admin Issue';
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
                <Tabs defaultValue="issue">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="issue">Issue Tokens</TabsTrigger>
                        <TabsTrigger value="acquired">Acquired</TabsTrigger>
                        <TabsTrigger value="distribution">Distribution</TabsTrigger>
                        <TabsTrigger value="p2p">P2P Transfers</TabsTrigger>
                        <TabsTrigger value="ledger">Ledger</TabsTrigger>
                    </TabsList>
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
                </Tabs>
            </CardContent>
        </Card>
    )
}

function RoomsTabContent() {
  const [rooms, setRooms] = useState<ClientSyncRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [user] = useAuthState(auth);
  const [editability, setEditability] = useState<Record<string, boolean>>({});

  const handleFetchRooms = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const fetchedRooms = await getAllRooms();
      setRooms(fetchedRooms);
      const initialEditability: Record<string, boolean> = {};
      fetchedRooms.forEach(room => {
        if(room.summary) {
            initialEditability[room.id] = (room.summary as any).allowMoreEdits || false;
        }
      });
      setEditability(initialEditability);
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleEditabilityChange = async (roomId: string, canEdit: boolean) => {
    setEditability(prev => ({ ...prev, [roomId]: canEdit }));
    const result = await setRoomEditability(roomId, canEdit);
    if (result.success) {
        toast({ title: "Success", description: "Room editability updated." });
    } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
        // Revert UI on failure
        setEditability(prev => ({ ...prev, [roomId]: !canEdit }));
    }
  };
  
  const { activeRooms, closedWithSummary, closedWithoutSummary, scheduledRooms } = useMemo(() => {
    return {
      activeRooms: rooms.filter(r => r.status === 'active'),
      closedWithSummary: rooms.filter(r => r.status === 'closed' && r.summary),
      closedWithoutSummary: rooms.filter(r => r.status === 'closed' && !r.summary),
      scheduledRooms: rooms.filter(r => r.status === 'scheduled'),
    };
  }, [rooms]);

  const handleDeleteRoom = async (roomId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms([roomId]);
        if (result.success) {
            toast({ title: "Success", description: `Room deleted.` });
            await handleFetchRooms();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete room.' });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleDeleteAllInCategory = async (roomIds: string[]) => {
    if (!user || roomIds.length === 0) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms(roomIds);
        if (result.success) {
            toast({ title: "Success", description: `${roomIds.length} room(s) permanently deleted.` });
            await handleFetchRooms();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete rooms.' });
    } finally {
        setIsDeleting(false);
    }
  };


  const RoomList = ({ title, rooms, allowDeleteAll }: { title: string; rooms: ClientSyncRoom[], allowDeleteAll: boolean }) => (
    <div>
        <div className="font-semibold p-2 border-b flex items-center justify-between">
            <h4>{title} ({rooms.length})</h4>
            {allowDeleteAll && rooms.length > 0 && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">Delete All</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete all {rooms.length} rooms in this category. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteAllInCategory(rooms.map(r => r.id))}>Confirm Delete All</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
        <div className="border rounded-md max-h-60 overflow-y-auto">
            <Table>
                <TableBody>
                    {rooms.map(room => (
                        <TableRow key={room.id}>
                            <TableCell className="w-12 p-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteRoom(room.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </TableCell>
                            <TableCell className="p-2 font-medium">
                                {room.topic}
                            </TableCell>
                            <TableCell className="p-2 text-right flex items-center justify-end gap-2">
                                {room.status === 'closed' && room.summary && (
                                  <>
                                    <Label htmlFor={`edit-switch-${room.id}`} className="text-xs">Allow Edits</Label>
                                    <Switch 
                                        id={`edit-switch-${room.id}`}
                                        checked={editability[room.id] || false}
                                        onCheckedChange={(checked) => handleEditabilityChange(room.id, checked)}
                                    />
                                  </>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Room Management</CardTitle>
        <CardDescription>
          Use this tool to manage rooms. Deleting individual rooms is immediate. Deleting all rooms in a category requires confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleFetchRooms} disabled={isLoading}>
            {isLoading ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
            {rooms.length > 0 ? 'Refresh List' : 'Fetch All Rooms'}
        </Button>

        {error && (
          <div className="p-4 bg-destructive/20 text-destructive rounded-md">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}
        
        {isDeleting && (
            <div className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin"/> Deleting...
            </div>
        )}

        {rooms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               <RoomList title="Rooms with Summaries" rooms={closedWithSummary} allowDeleteAll={true} />
               <RoomList title="Active &amp; Scheduled" rooms={[...activeRooms, ...scheduledRooms]} allowDeleteAll={false} />
               <RoomList title="Closed (No Summary)" rooms={closedWithoutSummary} allowDeleteAll={true} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkActionsContent() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [clearNotificationsOpen, setClearNotificationsOpen] = useState(false);

    const handleClearNotifications = async () => {
        setIsLoading(true);
        const result = await clearAllNotifications();
        if (result.success) {
            toast({ title: "Success", description: "All notification data has been cleared." });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not clear notification data.' });
        }
        setIsLoading(false);
        setClearNotificationsOpen(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> Bulk Data Management</CardTitle>
                <CardDescription>
                    Perform system-wide data clearing actions. These are irreversible and should be used with extreme caution.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="bulk-delete-users">
                        <AccordionTrigger>Bulk Delete Users</AccordionTrigger>
                        <AccordionContent>
                           <BulkDeleteUsers />
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="clear-notifications">
                        <AccordionTrigger>Clear All Notifications</AccordionTrigger>
                        <AccordionContent>
                            <div className="p-4 space-y-4">
                                <p className="text-sm text-muted-foreground">This will permanently delete all records from the `notifications` collection for all users. This action is irreversible.</p>
                                <AlertDialog open={clearNotificationsOpen} onOpenChange={setClearNotificationsOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={isLoading}>
                                            <BellOff className="mr-2" />
                                            {isLoading ? 'Clearing...' : 'Clear All Notifications'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all notifications for every user in the system. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleClearNotifications} disabled={isLoading}>
                                                {isLoading && <LoaderCircle className="animate-spin mr-2" />}
                                                Confirm &amp; Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    )
}


function BulkDeleteUsers() {
    const [currentUser] = useAuthState(auth);
    const { toast } = useToast();
    const [users, setUsers] = useState<UserWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [confirmationText, setConfirmationText] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const fetchAllUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, orderBy('email'));
            const snapshot = await getDocs(q);
            const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
            setUsers(allUsers);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch users.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchAllUsers();
    }, [fetchAllUsers]);

    const handleSelectUser = (userId: string, checked: boolean) => {
        setSelectedUserIds(prev => 
            checked ? [...prev, userId] : prev.filter(id => id !== userId)
        );
    };

    const handleSelectAll = (checked: boolean) => {
        // Prevent admin from deselecting themselves if they are the only one left
        const nonAdminUsers = users.filter(u => u.id !== currentUser?.uid);
        if (checked) {
            setSelectedUserIds(users.map(u => u.id));
        } else {
             setSelectedUserIds(selectedUserIds.filter(id => id === currentUser?.uid));
        }
    };
    
    const handleDelete = async () => {
        if (confirmationText !== 'permanently delete') {
            toast({ variant: 'destructive', title: 'Confirmation failed', description: 'Please type the confirmation phrase exactly.'});
            return;
        }

        setIsDeleting(true);
        const result = await deleteUsers(selectedUserIds);
        if (result.success) {
            toast({ title: 'Success', description: `${selectedUserIds.length} user(s) have been permanently deleted.`});
            setSelectedUserIds([]);
            setConfirmationText('');
            setIsConfirmOpen(false);
            await fetchAllUsers();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete users.' });
        }
        setIsDeleting(false);
    };

    return (
        <div className="p-4 space-y-4">
             <div className="flex justify-end">
                <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={selectedUserIds.length === 0 || isDeleting}>
                            {isDeleting ? <LoaderCircle className="animate-spin mr-2" /> : <Trash2 className="mr-2" />}
                            Delete Selected ({selectedUserIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete {selectedUserIds.length} user(s) and all their associated data, including transaction history and authentication accounts. This action cannot be undone.
                                <br/><br/>
                                Please type <strong className="text-destructive">permanently delete</strong> to confirm.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input 
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="permanently delete"
                        />
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={handleDelete}
                                disabled={isDeleting || confirmationText !== 'permanently delete'}
                            >
                                 {isDeleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Deletion
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <Checkbox 
                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                    checked={users.length > 0 && selectedUserIds.length === users.length}
                                    aria-label="Select all"
                                />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
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
                            users.map((user) => (
                                <TableRow key={user.id} data-state={selectedUserIds.includes(user.id) && "selected"}>
                                    <TableCell>
                                        <Checkbox
                                            onCheckedChange={(checked) => handleSelectUser(user.id, !!checked)}
                                            checked={selectedUserIds.includes(user.id)}
                                            aria-label={`Select user ${user.name}`}
                                            disabled={user.id === currentUser?.uid && user.role === 'admin'}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        {user.role === 'admin' ? 
                                            <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                            <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                        }
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function MessagingContent() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquareQuote /> App Messaging &amp; Policy</CardTitle>
                <CardDescription>
                    Standardized documentation for administrative procedures, external marketing, and data policies.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <Accordion type="single" collapsible className="w-full">
                     <AccordionItem value="item-beta">
                        <AccordionTrigger>Beta Tester Information</AccordionTrigger>
                        <AccordionContent>
                           <BetaTesterInfo />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>Admin Standard Operating Procedures (SOP)</AccordionTrigger>
                        <AccordionContent>
                           <AdminSOP />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                        <AccordionTrigger>Marketing Copy for Backpackers</AccordionTrigger>
                        <AccordionContent>
                           <BackpackerMarketing />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                        <AccordionTrigger>Release 0.1 Marketing Page</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease />
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="item-5">
                        <AccordionTrigger>Release 0.1 Marketing Page 2</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease2 />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-6">
                        <AccordionTrigger>Release 0.1 Marketing Page 3</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease3 />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}

function LanguagePacksTabContent() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Language Packs</CardTitle>
                <CardDescription>
                    Manage offline language packs. Generate new packs and set which ones are free for users to download.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="generate">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="generate">Generate</TabsTrigger>
                        <TabsTrigger value="free-packs">Free Language Packs</TabsTrigger>
                    </TabsList>
                    <TabsContent value="generate" className="mt-4">
                        <AudioPackGenerator />
                    </TabsContent>
                    <TabsContent value="free-packs" className="mt-4">
                        <FreeLanguagePacksManager />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}

function FeedbackTabContent() {
    const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchFeedback = useCallback(async () => {
        setIsLoading(true);
        try {
            const submissions = await getFeedbackSubmissions();
            setFeedback(submissions);
        } catch (error) {
            
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load feedback submissions.' });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Feedback</CardTitle>
                <CardDescription>Review feedback, feature requests, and bug reports from users.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={fetchFeedback} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {hasFetched ? "Refresh" : "Load Feedback"}
                </Button>
                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : hasFetched ? (
                    feedback.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No feedback submissions yet.</p>
                    ) : (
                        <div className="mt-4 space-y-4">
                            {feedback.map(item => (
                                <Card key={item.id}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg">{item.category}</CardTitle>
                                                <CardDescription>
                                                    Submitted by <a href={`mailto:${item.userEmail}`} className="text-primary hover:underline">{item.userEmail}</a> on {format(new Date(item.createdAt), 'PPpp')}
                                                </CardDescription>
                                            </div>
                                            {item.screenshotUrl && (
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline">View Screenshot</Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-4xl">
                                                        <Image src={item.screenshotUrl} alt="User screenshot" width={1200} height={800} className="w-full h-auto rounded-md" />
                                                    </DialogContent>
                                                </Dialog>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="whitespace-pre-wrap">{item.comment}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )
                ) : (
                     <p className="text-center text-muted-foreground py-10">Click the button to load user feedback.</p>
                )}
            </CardContent>
        </Card>
    );
}

export default function AdminPageV2() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'rooms');

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        router.push(`/admin?tab=${value}`, { scroll: false });
    };
    
    useEffect(() => {
        const currentTab = searchParams.get('tab');
        if (currentTab && currentTab !== activeTab) {
            setActiveTab(currentTab);
        }
    }, [searchParams, activeTab]);

    const adminTabs = [
        { value: 'rooms', label: 'Rooms', icon: RadioTower },
        { value: 'users', label: 'Users', icon: Users },
        { value: 'feedback', label: 'Feedback', icon: LifeBuoy },
        { value: 'settings', label: 'App Settings', icon: Settings },
        { value: 'financial', label: 'Financial', icon: LineChart },
        { value: 'tokens', label: 'Tokens', icon: Coins },
        { value: 'language-packs', label: 'Language Packs', icon: Music },
        { value: 'bulk-actions', label: 'Bulk Actions', icon: Trash2 },
        { value: 'messaging', label: 'Messaging', icon: MessageSquareQuote },
    ];
    
    return (
        <div className="space-y-8">
            <MainHeader title="Admin Dashboard" description="Manage users and app settings." />
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 lg:grid-cols-9 h-auto">
                    {adminTabs.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-2 h-full">
                            <tab.icon className="h-5 w-5" />
                            <span className="hidden md:inline">{tab.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-6">
                    <TabsContent value="rooms">
                        <RoomsTabContent />
                    </TabsContent>
                    <TabsContent value="users">
                        <UsersTabContent />
                    </TabsContent>
                    <TabsContent value="feedback">
                        <FeedbackTabContent />
                    </TabsContent>
                    <TabsContent value="settings">
                        <SettingsTabContent />
                    </TabsContent>
                    <TabsContent value="financial">
                        <FinancialTabContent />
                    </TabsContent>
                    <TabsContent value="tokens">
                        <TokensTabContent />
                    </TabsContent>
                    <TabsContent value="language-packs">
                        <LanguagePacksTabContent />
                    </TabsContent>
                    <TabsContent value="bulk-actions">
                        <BulkActionsContent />
                    </TabsContent>
                    <TabsContent value="messaging">
                        <MessagingContent />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}


    
