
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, doc, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Shield, User as UserIcon, ArrowRight, Save, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppSettings, updateAppSettings, type AppSettings } from '@/services/settings';


interface UserWithId extends UserProfile {
    id: string;
}

const USERS_PER_PAGE = 20;

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
    const [isLoading, setIsLoading] = useState(true);
    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [isFetchingNext, setIsFetchingNext] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [isSearching, setIsSearching] = useState(false);

     const fetchUsers = useCallback(async (loadMore = false, search = '') => {
        if (loadMore) {
            setIsFetchingNext(true);
        } else {
            setIsLoading(true);
            setUsers([]);
            setLastVisible(null);
        }
        
        try {
            const usersRef = collection(db, 'users');
            let finalUsers: UserWithId[] = [];
            let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
            let moreToLoad = true;
            
            const normalizedSearch = search.toLowerCase();

            if (normalizedSearch) {
                // Perform two separate queries and merge the results
                const nameQuery = query(usersRef, 
                    where("searchableName", ">=", normalizedSearch),
                    where("searchableName", "<=", normalizedSearch + '\uf8ff')
                );
                const emailQuery = query(usersRef, 
                    where("searchableEmail", ">=", normalizedSearch),
                    where("searchableEmail", "<=", normalizedSearch + '\uf8ff')
                );

                const [nameSnapshot, emailSnapshot] = await Promise.all([
                    getDocs(nameQuery),
                    getDocs(emailQuery)
                ]);

                const nameResults = nameSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
                const emailResults = emailSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));

                // Merge and deduplicate results
                const allResults = [...nameResults, ...emailResults];
                const uniqueUsers = new Map<string, UserWithId>();
                allResults.forEach(user => uniqueUsers.set(user.id, user));
                
                finalUsers = Array.from(uniqueUsers.values());
                moreToLoad = false; // Disable pagination for search results
            } else {
                let q;
                if (loadMore && lastVisible) {
                    q = query(usersRef, orderBy("email"), startAfter(lastVisible), limit(USERS_PER_PAGE));
                } else {
                    q = query(usersRef, orderBy("email"), limit(USERS_PER_PAGE));
                }
                const querySnapshot = await getDocs(q);
                finalUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
                lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
                moreToLoad = querySnapshot.docs.length === USERS_PER_PAGE;
            }
            
            setLastVisible(lastDoc || null);
            setHasMore(moreToLoad);
            
            if (loadMore) {
                setUsers(prev => [...prev, ...finalUsers]);
            } else {
                setUsers(finalUsers);
            }

        } catch (error: any) {
            console.error("Error fetching users:", error);
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
            setIsFetchingNext(false);
            setIsSearching(false);
        }
    }, [lastVisible, toast]);
    
    useEffect(() => {
        setIsSearching(true);
        fetchUsers(false, debouncedSearchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm]);


    const handleRowClick = (userId: string) => {
        router.push(`/admin/${userId}`);
    };

    if (isLoading && !isSearching) {
        return (
            <div className="flex justify-center items-center py-10">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>A list of all users in the system. Click a user to view and edit their details.</CardDescription>
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
                <div className="border rounded-md">
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
                            {(isLoading || isSearching) ? (
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
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex justify-center mt-6">
                    {hasMore && !searchTerm && (
                        <Button onClick={() => fetchUsers(true)} disabled={isFetchingNext}>
                            {isFetchingNext ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Load More
                        </Button>
                    )}
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
            const settingsToSave = {
                signupBonus: Number(settings.signupBonus) || 0,
                practiceReward: Number(settings.practiceReward) || 0,
                practiceThreshold: Number(settings.practiceThreshold) || 0,
                translationCost: Number(settings.translationCost) || 0,
            };
            await updateAppSettings(settingsToSave);
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
        setSettings(prev => ({...prev, [id]: value }));
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
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="signupBonus">Signup Bonus</Label>
                        <Input id="signupBonus" type="number" value={settings.signupBonus ?? ''} onChange={handleInputChange} placeholder="e.g., 100" />
                        <p className="text-sm text-muted-foreground">Tokens a new user gets on signup.</p>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="translationCost">Translation Cost</Label>
                        <Input id="translationCost" type="number" value={settings.translationCost ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                        <p className="text-sm text-muted-foreground">Tokens charged for each live translation.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="practiceReward">Practice Reward</Label>
                        <Input id="practiceReward" type="number" value={settings.practiceReward ?? ''} onChange={handleInputChange} placeholder="e.g., 1" />
                        <p className="text-sm text-muted-foreground">Tokens earned for mastering a phrase.</p>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="practiceThreshold">Practice Threshold</Label>
                        <Input id="practiceThreshold" type="number" value={settings.practiceThreshold ?? ''} onChange={handleInputChange} placeholder="e.g., 3" />
                         <p className="text-sm text-muted-foreground">Number of successful practices to earn reward.</p>
                    </div>
                </div>
                 <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Settings
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export default function AdminPage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);
    
    if (authLoading) {
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
                  <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
                  <p className="text-muted-foreground">Manage users and app settings.</p>
                </div>
            </header>
            
            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="settings">App Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="mt-6">
                    <UsersTabContent />
                </TabsContent>
                <TabsContent value="settings" className="mt-6">
                    <SettingsTabContent />
                </TabsContent>
            </Tabs>
        </div>
    );
}
