
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { SyncRoom, Participant } from '@/lib/types';
import { LoaderCircle, Mic, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';


function SyncRoomPageContent() {
    const params = useParams();
    const roomId = params.roomId as string;
    const [user, authLoading] = useAuthState(auth);
    const { toast } = useToast();
    const router = useRouter();

    const [room, setRoom] = useState<SyncRoom | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState<string | null>(null);
    const [hasJoined, setHasJoined] = useState(false);
    
    const [guestEmail, setGuestEmail] = useState('');
    const [guestName, setGuestName] = useState('');
    const [guestLanguage, setGuestLanguage] = useState<AzureLanguageCode | ''>('');
    const [isJoining, setIsJoining] = useState(false);
    
    const [userLanguage, setUserLanguage] = useState<AzureLanguageCode | ''>('');
    const [isMicPressed, setIsMicPressed] = useState(false);

    const currentUserIsSpeaker = room?.activeSpeakerUid === user?.uid;
    const isMicLocked = room?.activeSpeakerUid !== null && !currentUserIsSpeaker;

    useEffect(() => {
        if (!roomId) return;
        const roomRef = doc(db, 'syncRooms', roomId);

        const unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const roomData = { id: docSnap.id, ...docSnap.data() } as SyncRoom;
                if (user && roomData.invitedEmails && !roomData.invitedEmails.includes(user.email!)) {
                    setAccessDenied("You are not invited to this room.");
                } else {
                    setRoom(roomData);
                }
            } else {
                setAccessDenied("This room does not exist.");
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching room:", err);
            setAccessDenied("Could not retrieve room information.");
            setLoading(false);
        });

        const participantsRef = collection(db, 'syncRooms', roomId, 'participants');
        const q = query(participantsRef);
        const unsubscribeParticipants = onSnapshot(q, (snapshot) => {
            const parts = snapshot.docs.map(doc => doc.data() as Participant);
            setParticipants(parts);

            if (user) {
                const isParticipant = parts.some(p => p.uid === user.uid);
                setHasJoined(isParticipant);
            }
        });
        
        return () => {
            unsubscribeRoom();
            unsubscribeParticipants();
        }
    }, [roomId, user, authLoading]);

    const handleMicPress = async () => {
        if (!user || !room || room.activeSpeakerUid) return;
        setIsMicPressed(true);
        const roomRef = doc(db, 'syncRooms', roomId);
        try {
            await updateDoc(roomRef, { activeSpeakerUid: user.uid });
        } catch (error) {
            console.error("Error pressing mic:", error);
            setIsMicPressed(false);
        }
    };

    const handleMicRelease = async () => {
        if (!user || !room || room.activeSpeakerUid !== user.uid) return;
        setIsMicPressed(false);
        const roomRef = doc(db, 'syncRooms', roomId);
        try {
            await updateDoc(roomRef, { activeSpeakerUid: null });
        } catch (error) {
            console.error("Error releasing mic:", error);
        }
    };
    
    const handleLeaveRoom = async () => {
        if (!user) return;
        try {
            const participantRef = doc(db, `syncRooms/${roomId}/participants`, user.uid);
            await deleteDoc(participantRef);
            toast({ title: "You have left the room." });
            router.push('/');
        } catch (error) {
            console.error("Error leaving room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not leave the room.' });
        }
    };

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
                isEmcee: room.creatorUid === user.uid,
                isMuted: false,
            };
            await setDoc(doc(db, `syncRooms/${roomId}/participants`, user.uid), newParticipant);
            toast({ title: 'Success', description: 'You have joined the room.' });
            setHasJoined(true);
        } catch (error: any) {
            console.error("Error joining as registered user:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room: ' + error.message });
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

        if (room.invitedEmails && !room.invitedEmails.includes(guestEmail)) {
            toast({ variant: 'destructive', title: 'Not Invited', description: 'This email is not on the invitation list.' });
            return;
        }

        setIsJoining(true);
        try {
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
        } catch (error: any) {
            console.error("Error joining as guest:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room: ' + error.message });
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
        return (
            <div className="flex justify-center items-center h-screen">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (hasJoined) {
        return (
            <div className="p-4 md:p-6 flex flex-col h-screen">
                 <header className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">{room.topic}</h1>
                        <p className="text-muted-foreground">Welcome to the Sync Room!</p>
                    </div>
                    <Button variant="ghost" onClick={handleLeaveRoom}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Leave Room
                    </Button>
                </header>

                 <div className="flex-grow my-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {participants.map(p => (
                        <Card key={p.email} className={cn(
                            "flex flex-col items-center justify-center p-4 text-center border-4",
                             room.activeSpeakerUid === p.uid ? 'border-primary shadow-lg' : 'border-border'
                        )}>
                            <Avatar className="h-16 w-16 text-2xl mb-2">
                                <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <Mic className={cn("h-8 w-8 my-2", room.activeSpeakerUid === p.uid ? 'text-primary' : 'text-muted-foreground' )} />
                            <p className="font-bold truncate w-full">{p.name}</p>
                            <p className="text-sm text-muted-foreground">{azureLanguages.find(l => l.value === p.selectedLanguage)?.label.split(' ')[0]}</p>
                        </Card>
                    ))}
                </div>
                 
                 <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <Button 
                        size="lg" 
                        className={cn("rounded-full w-32 h-32 text-lg shadow-2xl transition-all duration-200",
                             isMicPressed && 'bg-green-500 hover:bg-green-600 scale-110',
                             isMicLocked && 'bg-muted text-muted-foreground'
                        )}
                        onMouseDown={handleMicPress}
                        onMouseUp={handleMicRelease}
                        onTouchStart={handleMicPress}
                        onTouchEnd={handleMicRelease}
                        disabled={isMicLocked}
                    >
                        <Mic className="h-10 w-10" />
                    </Button>
                     <p className="text-sm text-muted-foreground mt-4">{isMicLocked ? "Mic is locked by another user" : "Press and hold to talk"}</p>
                </div>
            </div>
        )
    }
    
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
