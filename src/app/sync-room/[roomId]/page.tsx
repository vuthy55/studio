
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import type { SyncRoom, Participant } from '@/lib/types';
import { LoaderCircle, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


function SyncRoomPageContent() {
    const params = useParams();
    const roomId = params.roomId as string;
    const [user, authLoading] = useAuthState(auth);
    const { toast } = useToast();
    const router = useRouter();

    const [room, setRoom] = useState<SyncRoom | null>(null);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState<string | null>(null);
    const [hasJoined, setHasJoined] = useState(false);
    
    // Guest form state
    const [guestEmail, setGuestEmail] = useState('');
    const [guestName, setGuestName] = useState('');
    const [guestLanguage, setGuestLanguage] = useState<AzureLanguageCode | ''>('');
    const [isJoining, setIsJoining] = useState(false);
    
    // Registered user join state
    const [userLanguage, setUserLanguage] = useState<AzureLanguageCode | ''>('');


    useEffect(() => {
        if (!roomId || authLoading) return;
        setLoading(true);

        const roomRef = doc(db, 'syncRooms', roomId);
        getDoc(roomRef).then(async docSnap => {
            if (docSnap.exists()) {
                const roomData = { id: docSnap.id, ...docSnap.data() } as SyncRoom;
                
                // Permission check
                if (user && !roomData.invitedEmails.includes(user.email!)) {
                    setAccessDenied("You are not invited to this room.");
                } else {
                     setRoom(roomData);
                }

                // Check if user is already a participant
                if (user) {
                    const participantRef = doc(db, `syncRooms/${roomId}/participants`, user.uid);
                    const participantSnap = await getDoc(participantRef);
                    if (participantSnap.exists()) {
                        setHasJoined(true);
                    }
                }
            } else {
                setAccessDenied("This room does not exist.");
            }
        }).catch(err => {
            console.error("Error fetching room:", err);
            setAccessDenied("Could not retrieve room information.");
        }).finally(() => {
            setLoading(false);
        });
    }, [roomId, user, authLoading]);
    
    const handleRegisteredUserJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !userLanguage || !room) {
             toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select your language.' });
            return;
        }

        setIsJoining(true);
        try {
            const newParticipant: Participant = {
                name: user.displayName || 'User',
                email: user.email!,
                uid: user.uid,
                selectedLanguage: userLanguage,
                isEmcee: room.creatorUid === user.uid, // Creator is first emcee
                isMuted: false,
            };
            await setDoc(doc(db, `syncRooms/${roomId}/participants`, user.uid), newParticipant);
            toast({ title: 'Success', description: 'You have joined the room.' });
            setHasJoined(true);
        } catch (error) {
            console.error("Error joining as registered user:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    }

    const handleGuestJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!room || !guestEmail || !guestName || !guestLanguage) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
            return;
        }

        if (!room.invitedEmails.includes(guestEmail)) {
            toast({ variant: 'destructive', title: 'Not Invited', description: 'This email is not on the invitation list.' });
            return;
        }

        setIsJoining(true);
        try {
            // Using email as ID for guests, but sanitized
            const guestId = guestEmail.replace(/[^a-zA-Z0-9]/g, "_");
            const newParticipant: Participant = {
                name: guestName,
                email: guestEmail,
                uid: null,
                selectedLanguage: guestLanguage,
                isEmcee: false,
                isMuted: false,
            };
            await setDoc(doc(db, `syncRooms/${roomId}/participants`, guestId), newParticipant);
            toast({ title: 'Success', description: 'You have joined the room.' });
            setHasJoined(true);
             // We can check if guest is already in participants list via email, but for now we assume they are new
             // This might lead to duplicate guests if they rejoin.
        } catch (error) {
            console.error("Error joining as guest:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    };
    
    if (loading || authLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (accessDenied) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>{accessDenied}</p>
                        <Button onClick={() => router.push('/')} className="mt-4">Go to Home</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!room) {
        // This case can happen briefly before accessDenied is set.
        return (
            <div className="flex justify-center items-center h-screen">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    // Main room UI if joined
    if (hasJoined) {
        return (
            <div className="p-4 md:p-6">
                <h1 className="text-3xl font-bold font-headline">{room.topic}</h1>
                <p className="text-muted-foreground">Welcome to the Sync Room!</p>
                {/* Future room UI goes here */}
                 <div className="mt-8">
                    <h2 className="text-xl font-semibold">Participants</h2>
                    {/* Placeholder for participant list */}
                </div>
                 <div className="fixed bottom-10 left-1/2 -translate-x-1/2">
                    <Button size="lg" className="rounded-full w-32 h-32 text-lg">
                        <Mic className="h-10 w-10 mr-2" /> Talk
                    </Button>
                </div>
            </div>
        )
    }
    
    // Logged-in user join form
    if (user) {
        return (
             <div className="flex justify-center items-center h-screen">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Avatar className="h-20 w-20 text-3xl mb-2">
                             <AvatarFallback>{user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <CardTitle>Join "{room.topic}"</CardTitle>
                        <CardDescription>Welcome, {user.displayName || user.email}! Please select your spoken language to enter the room.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <form onSubmit={handleRegisteredUserJoin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="user-language">Your Language</Label>
                                <Select onValueChange={(v) => setUserLanguage(v as AzureLanguageCode)} value={userLanguage} required>
                                    <SelectTrigger id="user-language">
                                        <SelectValue placeholder="Select your language..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {azureLanguages.map(lang => (
                                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full" disabled={isJoining}>
                                {isJoining ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Join Room
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Guest join form
    return (
        <div className="flex justify-center items-center h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Join "{room.topic}"</CardTitle>
                    <CardDescription>Enter your details to join the room. Your email must be on the invite list.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleGuestJoin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="guest-email">Email</Label>
                            <Input id="guest-email" type="email" placeholder="you@example.com" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="guest-name">Your Name</Label>
                            <Input id="guest-name" placeholder="John Doe" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="guest-language">Your Language</Label>
                            <Select onValueChange={(v) => setGuestLanguage(v as AzureLanguageCode)} value={guestLanguage} required>
                                <SelectTrigger id="guest-language">
                                    <SelectValue placeholder="Select your language..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {azureLanguages.map(lang => (
                                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" className="w-full" disabled={isJoining}>
                            {isJoining ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Join Room
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function SyncRoomPage() {
    return <SyncRoomPageContent />;
}
