
"use client";

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { LoaderCircle, Save, Coins, FileText, Heart, Copy } from "lucide-react";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { lightweightCountries } from '@/lib/location-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TransactionLog, PaymentLog } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useUserData } from '@/context/UserDataContext';
import BuyTokens from '@/components/BuyTokens';
import ReferralLink from '@/components/ReferralLink';

export interface PracticeStats {
  byLanguage?: {
    [languageCode: string]: {
      practiced: number;
      correct: number;
    };
  };
}
export interface UserProfile {
  name: string;
  email: string;
  country?: string;
  mobile?: string;
  role?: 'admin' | 'user';
  tokenBalance?: number;
  searchableName?: string;
  searchableEmail?: string;
  practiceStats?: PracticeStats;
  syncLiveUsage?: number; // Total accumulated usage in milliseconds
}

function ProfileSection({ profile, setProfile, isSaving, handleSaveProfile, getInitials, countryOptions, handleCountryChange }: any) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20 text-3xl">
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
                    <div className="flex justify-end">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}

function PaymentHistorySection() {
    const [user] = useAuthState(auth);
    const [payments, setPayments] = useState<PaymentLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setPayments([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const paymentsRef = collection(db, 'users', user.uid, 'paymentHistory');
        const q = query(paymentsRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data() as PaymentLog);
            setPayments(data);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching payment history:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Payments</CardTitle>
                <CardDescription>A record of all your token purchases and donations.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <LoaderCircle className="animate-spin" /> : payments.length > 0 ? (
                    <ul className="space-y-4">
                        {payments.map(p => (
                            <li key={p.orderId} className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium flex items-center gap-2">
                                        {p.tokensPurchased > 0 ? (
                                            `Purchased ${p.tokensPurchased} Tokens`
                                        ) : (
                                            <>
                                            <Heart className="h-4 w-4 text-red-500"/>
                                            Donation
                                            </>
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {p.createdAt ? formatDistanceToNow(p.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold">${p.amount.toFixed(2)} {p.currency}</p>
                                    <p className="text-xs text-muted-foreground">Order ID: {p.orderId}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-muted-foreground">No payment history found.</p>}
            </CardContent>
        </Card>
    )
}

function TokenHistorySection() {
    const [user] = useAuthState(auth);
    const [transactions, setTransactions] = useState<TransactionLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

     const getActionText = (log: TransactionLog) => {
        switch (log.actionType) {
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'practice_earn': return 'Practice Reward';
            case 'signup_bonus': return 'Welcome Bonus';
            case 'purchase': return 'Token Purchase';
            case 'referral_bonus': return 'Referral Bonus';
            default: return 'Unknown Action';
        }
    }

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
            const data = snapshot.docs.map(doc => doc.data() as TransactionLog);
            setTransactions(data);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching token history:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Token Ledger</CardTitle>
                <CardDescription>A complete log of your token earnings and spending.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <LoaderCircle className="animate-spin" /> : transactions.length > 0 ? (
                     <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                        {transactions.map((log, index) => (
                            <div key={index} className="flex items-center">
                                <div className="p-3 rounded-full bg-secondary">
                                    <div className={`font-bold text-sm ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange}
                                    </div>
                                </div>
                                <div className="ml-4 flex-grow">
                                    <p className="text-sm font-medium leading-none">{getActionText(log)}</p>
                                    <p className="text-sm text-muted-foreground truncate max-w-xs">{log.description}</p>
                                </div>
                                <p className="text-xs text-muted-foreground ml-auto">
                                    {log.timestamp ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                                </p>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-muted-foreground">No token history found.</p>}
            </CardContent>
        </Card>
    )
}

export default function ProfilePage() {
    const { user, loading: authLoading, userProfile, fetchUserProfile } = useUserData();
    const router = useRouter();
    const { toast } = useToast();
    
    const [profile, setProfile] = useState<Partial<UserProfile>>({});
    const [isSaving, setIsSaving] = useState(false);

    const countryOptions = useMemo(() => lightweightCountries, []);

     useEffect(() => {
        if (!authLoading && user) {
            fetchUserProfile();
        }
    }, [user, authLoading, fetchUserProfile]);

    useEffect(() => {
        if(userProfile) {
            setProfile(userProfile);
        }
    }, [userProfile]);

    useEffect(() => {
        if (!authLoading && !user) {
            // Clear sensitive data on logout before redirecting
            setProfile({});
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const handleCountryChange = (countryCode: string) => {
        setProfile(prev => ({ ...prev, country: countryCode }));
        const selected = countryOptions.find(c => c.code === countryCode);
        if (selected && (!profile.mobile || !profile.mobile.startsWith('+'))) {
            setProfile(prev => ({ ...prev, mobile: `+${selected.phone} ` }));
        }
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
            const { name, country, mobile } = profile;
            const dataToSave = {
                name: name || '',
                country: country || '',
                mobile: mobile || '',
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

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex justify-between items-start">
                 <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div>
                        <h1 className="text-3xl font-bold font-headline">My Account</h1>
                        <p className="text-muted-foreground">Manage settings and track your history.</p>
                    </div>
                 </div>
                 <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 text-lg font-bold text-amber-500">
                        <Coins className="h-6 w-6" />
                        <span>{profile.tokenBalance ?? 0}</span>
                    </div>
                    <BuyTokens />
                 </div>
            </header>
            
            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="referrals">Referrals</TabsTrigger>
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="tokens">Tokens</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="mt-6">
                    <ProfileSection 
                        profile={profile} 
                        setProfile={setProfile} 
                        isSaving={isSaving}
                        handleSaveProfile={handleSaveProfile}
                        getInitials={getInitials}
                        countryOptions={countryOptions}
                        handleCountryChange={handleCountryChange}
                    />
                </TabsContent>
                <TabsContent value="referrals" className="mt-6">
                   <ReferralLink />
                </TabsContent>
                <TabsContent value="payments" className="mt-6">
                    <PaymentHistorySection />
                </TabsContent>
                <TabsContent value="tokens" className="mt-6">
                    <TokenHistorySection />
                </TabsContent>
            </Tabs>
        </div>
    );
}
