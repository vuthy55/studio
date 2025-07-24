
"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { LoaderCircle, Save, Shield, User as UserIcon, ArrowLeft, Coins, FileText, Edit } from "lucide-react";
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';

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
import type { TransactionLog } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);
    const [isFetchingLogs, setIsFetchingLogs] = useState(true);

    const countryOptions = useMemo(() => lightweightCountries, []);

    const fetchProfileAndLogs = useCallback(async (uid: string) => {
        setIsFetchingProfile(true);
        setIsFetchingLogs(true);
        try {
            // Fetch Profile
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as UserProfile & { id: string });
            } else {
                toast({ variant: "destructive", title: "Not Found", description: "This user does not exist." });
                router.push('/admin');
                return;
            }
            setIsFetchingProfile(false);

            // Fetch Transaction Logs
            const transRef = collection(db, 'users', uid, 'transactionLogs');
            const q = query(transRef, orderBy('timestamp', 'desc'));
            const transSnapshot = await getDocs(q);
            const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransactionLogWithId));
            setTransactions(transData);

        } catch (fetchError) {
            console.error("Error fetching user data:", fetchError);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch user data." });
        } finally {
            setIsFetchingProfile(false);
            setIsFetchingLogs(false);
        }
    }, [router, toast]);

    useEffect(() => {
        if (adminLoading) return;
        if (!adminUser) {
            // Clear sensitive data on logout before redirecting
            setProfile({});
            setTransactions([]);
            router.push('/login');
            return;
        }
        if (userId) {
            fetchProfileAndLogs(userId);
        }
    }, [adminUser, adminLoading, router, userId, fetchProfileAndLogs]);


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
        switch (log.actionType) {
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

    if (adminLoading || isFetchingProfile) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className="md:col-span-1 space-y-8">
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
                 
                 <div className="md:col-span-2">
                    <Tabs defaultValue="edit" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="edit">Edit Profile</TabsTrigger>
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
                                            <Label htmlFor="mobile">Mobile Number</Label>
                                            <Input id="mobile" type="tel" value={profile.mobile || ''} onChange={handleInputChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <Input id="email" type="email" value={profile.email || ''} onChange={handleInputChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="tokenBalance">Token Balance</Label>
                                            <Input id="tokenBalance" type="number" value={profile.tokenBalance || 0} onChange={handleInputChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="syncLiveUsage">Sync Live Usage (ms)</Label>
                                            <Input id="syncLiveUsage" type="number" value={profile.syncLiveUsage || 0} onChange={handleInputChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="syncOnlineUsage">Sync Online Usage (ms)</Label>
                                            <Input id="syncOnlineUsage" type="number" value={profile.syncOnlineUsage || 0} onChange={handleInputChange} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="syncOnlineUsageLastReset">Sync Online Reset</Label>
                                            <Input 
                                                id="syncOnlineUsageLastReset" 
                                                value={profile.syncOnlineUsageLastReset ? format((profile.syncOnlineUsageLastReset as Timestamp).toDate(), 'PPpp') : 'Not set'} 
                                                disabled
                                            />
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
                                        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                                            {transactions.map(log => (
                                                <div key={log.id} className="flex items-start">
                                                    <div className={`p-3 rounded-full ${log.tokenChange >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                                                        <p className={`font-bold text-sm ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange}
                                                        </p>
                                                    </div>
                                                    <div className="ml-4 space-y-1">
                                                        <p className="text-sm font-medium leading-none">{getActionText(log)}</p>
                                                        <p className="text-sm text-muted-foreground truncate max-w-xs">
                                                            {log.description}
                                                            {log.duration && ` (${formatDuration(log.duration)})`}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                        {log.timestamp ? formatDistanceToNow((log.timestamp as Timestamp).toDate(), { addSuffix: true }) : 'Just now'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground py-8">No transaction logs found for this user.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                 </div>
            </div>
        </div>
    );
}

    