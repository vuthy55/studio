
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, addDoc, collection, updateDoc, arrayUnion } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile as updateAuthProfile, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { lightweightCountries, type LightweightCountry } from '@/lib/location-data';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import type { SyncRoom, Participant } from '@/lib/types';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processReferral } from '@/actions/referrals';

export default function JoinRoomPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const roomId = params.roomId as string;
    const referralId = useMemo(() => searchParams.get('ref'), [searchParams]);

    const [user, authLoading] = useAuthState(auth);
    
    const [roomTopic, setRoomTopic] = useState('a Sync Room'); // Generic topic
    const [isLoading, setIsLoading] = useState(true); // Manages initial loading state
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

    const fetchRoomAndRedirect = useCallback(async (user: User) => {
        console.log(`[DEBUG] fetchRoomAndRedirect: Called for authenticated user ${user.uid}.`);
        setIsSubmitting(true);
        try {
            console.log(`[DEBUG] fetchRoomAndRedirect: Attempting to get room document: syncRooms/${roomId}`);
            const roomDocRef = doc(db, 'syncRooms', roomId);
            const roomDoc = await getDoc(roomDocRef);
            if (!roomDoc.exists()) {
                toast({ variant: 'destructive', title: 'Room Not Found', description: 'This invitation link is invalid or has expired.' });
                router.push('/login');
                return;
            }
             const roomData = roomDoc.data() as SyncRoom;
             setRoomTopic(roomData.topic);

            // Add user to room and redirect.
            console.log(`[DEBUG] fetchRoomAndRedirect: Adding user ${user.uid} to participants.`);
            
            // Check if user is already invited, if not, add them.
            if (!roomData.invitedEmails.includes(user.email!)) {
                await updateDoc(roomDocRef, {
                    invitedEmails: arrayUnion(user.email!)
                });
            }

            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            const userProfileDoc = await getDoc(doc(db, 'users', user.uid));
            const userProfile = userProfileDoc.data();

            const participantData: Participant = {
                uid: user.uid,
                name: user.displayName || user.email!.split('@')[0],
                email: user.email!,
                selectedLanguage: spokenLanguage || userProfile?.defaultLanguage || 'en-US', // Default if somehow not set
                isMuted: false,
                joinedAt: Timestamp.now()
            };
            await setDoc(participantRef, participantData);
            
            console.log(`[DEBUG] fetchRoomAndRedirect: Redirecting to /sync-room/${roomId}`);
            router.push(`/sync-room/${roomId}`);

        } catch (error) {
             console.error("[DEBUG] Error in fetchRoomAndRedirect:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'Could not load room details or join the room.' });
             setIsSubmitting(false);
        }
    }, [roomId, router, toast, spokenLanguage]);


    useEffect(() => {
        console.log(`[DEBUG] Main Effect: Auth loading state is ${authLoading}. User object is ${user ? 'present' : 'null'}.`);
        if (authLoading) {
            console.log("[DEBUG] Main Effect: Auth is loading, waiting...");
            return; 
        }

        if (user) {
            // Path for already logged-in users
            console.log("[DEBUG] Main Effect: User is authenticated. Running fetchRoomAndRedirect.");
            fetchRoomAndRedirect(user);
        } else {
            // Path for new/unauthenticated users
            console.log("[DEBUG] Main Effect: User is not authenticated. Displaying sign-up form.");
            setIsLoading(false);
        }
    }, [authLoading, user, fetchRoomAndRedirect]);


    const handleCountryChange = (countryCode: string) => {
        const selected = countryOptions.find(c => c.code === countryCode);
        if (selected) {
            setCountry(countryCode);
            if (!mobile.startsWith('+')) {
                setMobile(`+${selected.phone} `);
            }
        }
    };
    
    const addUserToRoomAndRedirect = async (userObj: User) => {
        if (!roomId) return;
        setIsSubmitting(true);
        try {
            // We fetch the room topic here, after authentication
            console.log("[DEBUG] addUserToRoomAndRedirect: Getting room doc after signup.");
            const roomRef = doc(db, 'syncRooms', roomId);
            const roomDoc = await getDoc(roomRef);
            if (!roomDoc.exists()) throw new Error("Room not found");
            
            // Critical fix: Ensure the new user is on the invited list before redirecting.
            await updateDoc(roomRef, {
                invitedEmails: arrayUnion(userObj.email!)
            });

            console.log(`[DEBUG] addUserToRoomAndRedirect: Adding participant ${userObj.uid} to room.`);
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', userObj.uid);
            const participantData: Participant = {
                uid: userObj.uid,
                name: name || userObj.displayName || userObj.email!.split('@')[0],
                email: userObj.email!,
                selectedLanguage: spokenLanguage as AzureLanguageCode,
                isMuted: false,
                joinedAt: Timestamp.now()
            };
            await setDoc(participantRef, participantData);
            
            console.log(`[DEBUG] addUserToRoomAndRedirect: Redirecting to /sync-room/${roomId}`);
            router.push(`/sync-room/${roomId}`);
        } catch (error) {
            console.error("[DEBUG] Error adding participant to room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not add you to the room.'});
            setIsSubmitting(false);
        }
    };


    const handleSignUpAndJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("[DEBUG] handleSignUpAndJoin: Form submitted.");
        if (!name || !email || !password || !country || !spokenLanguage) {
            toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill out all required fields.'});
            return;
        }
        setIsSubmitting(true);

        try {
            // 1. Create user
            console.log("[DEBUG] handleSignUpAndJoin: Creating user with email and password.");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            // 2. Update Auth profile
            console.log("[DEBUG] handleSignUpAndJoin: Updating auth profile.");
            await updateAuthProfile(newUser, { displayName: name });
            
            // 3. Create Firestore user document with signup bonus
            console.log("[DEBUG] handleSignUpAndJoin: Creating Firestore user document.");
            const userDocRef = doc(db, 'users', newUser.uid);
            const signupBonus = settings?.signupBonus || 100;
            const userData = {
                name, email: email.toLowerCase(), country, mobile,
                role: 'user', tokenBalance: signupBonus,
                syncLiveUsage: 0, syncOnlineUsage: 0,
                searchableName: name.toLowerCase(),
                searchableEmail: email.toLowerCase(),
                createdAt: serverTimestamp(),
                defaultLanguage: spokenLanguage,
            };
            await setDoc(userDocRef, userData);

            // 4. Log signup bonus transaction
            console.log("[DEBUG] handleSignUpAndJoin: Logging signup bonus.");
            const logRef = collection(db, 'users', newUser.uid, 'transactionLogs');
            await addDoc(logRef, {
                actionType: 'signup_bonus',
                tokenChange: signupBonus,
                timestamp: serverTimestamp(),
                description: 'Welcome bonus for signing up!'
            });

            // 5. Handle referral if present
            if (referralId) {
                console.log(`[DEBUG] handleSignUpAndJoin: Processing referral for referrer ID: ${referralId}`);
                await processReferral(referralId, { uid: newUser.uid, name: name, email: email });
            }
            
            // 6. Add user to room and redirect
            console.log("[DEBUG] handleSignUpAndJoin: Calling addUserToRoomAndRedirect.");
            await addUserToRoomAndRedirect(newUser);

        } catch (error: any) {
            console.error("[DEBUG] Sign-up and join error:", error);
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

    if (user) {
         return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="text-center space-y-2">
                    <LoaderCircle className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground">You are already logged in.</p>
                    <p className="font-semibold">Adding you to the room...</p>
                </div>
            </div>
        );
    }
    

    return (
        <div className="flex h-screen w-full items-center justify-center bg-muted">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Join Room</CardTitle>
                    <CardDescription>Create an account to join the conversation.</CardDescription>
                </CardHeader>
                <form onSubmit={handleSignUpAndJoin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="spoken-language">Your Spoken Language</Label>
                             <Select onValueChange={(v) => setSpokenLanguage(v as AzureLanguageCode)} value={spokenLanguage} required>
                                <SelectTrigger id="spoken-language">
                                    <SelectValue placeholder="Select language..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-72">
                                        {azureLanguages.map(lang => (
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
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <LoaderCircle className="animate-spin" /> : 'Sign Up & Join Room'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
