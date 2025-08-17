
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { lightweightCountries } from '@/lib/location-data';
import { simpleLanguages } from '@/lib/simple-languages';
import type { AzureLanguageCode } from '@/lib/azure-languages';
import type { Vibe } from '@/lib/types';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { signUpUser } from '@/actions/auth';
import { useUserData } from '@/context/UserDataContext';

export default function JoinVibePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const vibeId = params.vibeId as string;
    const referralId = useMemo(() => searchParams.get('ref'), [searchParams]);

    const { user, loading: authLoading } = useUserData();
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [settings, setSettings] = useState<AppSettings | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [country, setCountry] = useState('');
    const [mobile, setMobile] = useState('');
    const [spokenLanguage, setSpokenLanguage] = useState<AzureLanguageCode | ''>('');

    const countryOptions = useMemo(() => lightweightCountries, []);
    
    useEffect(() => {
        getAppSettingsAction().then(setSettings);
    }, []);

    const fetchVibeAndRedirect = useCallback(async (user: any) => {
        setIsSubmitting(true);
        try {
            const vibeDocRef = doc(db, 'vibes', vibeId);
            const vibeDoc = await getDoc(vibeDocRef);
            if (!vibeDoc.exists()) {
                toast({ variant: 'destructive', title: 'Vibe Not Found', description: 'This invitation link is invalid or has expired.' });
                router.push('/login');
                return;
            }
             const vibeData = vibeDoc.data() as Vibe;

            if (!vibeData.invitedEmails.includes(user.email!)) {
                await updateDoc(vibeDocRef, {
                    invitedEmails: arrayUnion(user.email!)
                });
            }
            
            router.push(`/common-room/${vibeId}`);

        } catch (error) {
             console.error("Error in fetchVibeAndRedirect:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'Could not load Vibe details or join the Vibe.' });
             setIsSubmitting(false);
        }
    }, [vibeId, router, toast]);


    useEffect(() => {
        if (authLoading) return; 

        if (user) {
            fetchVibeAndRedirect(user);
        } else {
            setIsLoading(false);
        }
    }, [authLoading, user, fetchVibeAndRedirect]);


    const handleCountryChange = (countryCode: string) => {
        const selected = countryOptions.find(c => c.code === countryCode);
        if (selected) {
            setCountry(countryCode);
            if (!mobile.startsWith('+')) {
                setMobile(`+${selected.phone} `);
            }
        }
    };
    
    const handleSignUpAndJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password || !country || !spokenLanguage) {
            toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill out all required fields.'});
            return;
        }
        setIsSubmitting(true);

        try {
            const result = await signUpUser(
                { name, email, password, country, mobile, defaultLanguage: spokenLanguage },
                referralId,
                null, // No roomId
                vibeId
            );

            if (!result.success) {
                throw new Error(result.error || "Failed to process new user on the server.");
            }
            
            // Log the user in on the client side after successful server-side creation
            await signInWithEmailAndPassword(auth, email, password);
            
            // Redirect to the vibe page. The user data context will pick up the new user.
            // No need to check vibeExists on the client, as the server action now guarantees access.
            router.push(`/common-room/${vibeId}`);
            
        } catch (error: any) {
            console.error("Sign-up and join error:", error);
            toast({ variant: 'destructive', title: 'Sign-up Failed', description: error.message });
            setIsSubmitting(false);
        }
    };

    if (isLoading || authLoading || !settings) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="flex h-screen w-full items-center justify-center bg-muted">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">You're Invited!</CardTitle>
                    <CardDescription>Create an account or log in to join the conversation.</CardDescription>
                </CardHeader>
                 <CardContent className="space-y-4">
                     <Button className="w-full" asChild>
                         <Link href={`/login?redirect=/common-room/${vibeId}`}>
                             <LogIn className="mr-2" />
                             Login to Join
                         </Link>
                     </Button>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                            Or create a new account
                            </span>
                        </div>
                    </div>
                <form onSubmit={handleSignUpAndJoin}>
                        <div className="space-y-2">
                            <Label htmlFor="spoken-language">Your Spoken Language</Label>
                             <Select onValueChange={(v) => setSpokenLanguage(v as AzureLanguageCode)} value={spokenLanguage} required>
                                <SelectTrigger id="spoken-language">
                                    <SelectValue placeholder="Select language..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-72">
                                        {simpleLanguages.map(lang => (
                                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                        ))}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Your Name</Label>
                            <Input id="name" placeholder="Your Name" required value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="country">Country</Label>
                            <Select onValueChange={handleCountryChange} value={country} required>
                                <SelectTrigger id="country">
                                    <SelectValue placeholder="Select your country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map(c => (
                                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number (Optional)</Label>
                            <Input id="mobile" type="tel" placeholder="Your phone number" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                        </div>
                         <p className="text-sm text-muted-foreground text-center pt-2">
                            You'll receive {settings.signupBonus} tokens as a welcome bonus!
                        </p>
                    <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
                        {isSubmitting ? <LoaderCircle className="animate-spin" /> : <><UserPlus className="mr-2"/>Sign Up & Join Vibe</>}
                    </Button>
                </form>
                </CardContent>
            </Card>
        </div>
    );
}
