
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { useDocumentData, useCollection } from 'react-firebase-hooks/firestore';

import type { SyncRoom, Participant, RoomMessage } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Mic, ArrowLeft, Users, Send, User, Languages, LogIn } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


function SetupScreen({ user, room, roomId, onJoin }: { user: any; room: SyncRoom; roomId: string; onJoin: () => void }) {
    const [name, setName] = useState(user.displayName || user.email?.split('@')[0] || 'Participant');
    const [language, setLanguage] = useState<AzureLanguageCode | ''>('');
    const [isJoining, setIsJoining] = useState(false);
    const { toast } = useToast();

    const handleJoin = async () => {
        if (!name || !language) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please enter your name and select a language.' });
            return;
        }
        setIsJoining(true);
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            const participantData: Participant = {
                uid: user.uid,
                name: name,
                email: user.email!,
                selectedLanguage: language,
            };
            await setDoc(participantRef, participantData);
            onJoin();
        } catch (error) {
            console.error("Error joining room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Join Room: {room.topic}</CardTitle>
                    <CardDescription>Set up your details for this meeting.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Your Name</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="language">Your Spoken Language</Label>
                        <Select onValueChange={(v) => setLanguage(v as AzureLanguageCode)} value={language}>
                            <SelectTrigger id="language">
                                <SelectValue placeholder="Select your language..." />
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
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={handleJoin} disabled={isJoining}>
                        {isJoining ? <LoaderCircle className="animate-spin" /> : <LogIn className="mr-2" />}
                        Join Room
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


export default function SyncRoomPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const roomId = params.roomId as string;

    const [user, authLoading] = useAuthState(auth);

    const roomRef = useMemo(() => doc(db, 'syncRooms', roomId), [roomId]);
    const [roomData, roomLoading, roomError] = useDocumentData(roomRef);

    const participantsRef = useMemo(() => collection(db, 'syncRooms', roomId, 'participants'), [roomId]);
    const [participants, participantsLoading] = useCollection(participantsRef);

    const messagesRef = useMemo(() => collection(db, 'syncRooms', roomId, 'messages'), [roomId]);
    const messagesQuery = useMemo(() => query(messagesRef, orderBy('createdAt', 'asc')), [messagesRef]);
    const [messages, messagesLoading] = useCollection(messagesQuery);

    const [hasJoined, setHasJoined] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const currentUserParticipant = useMemo(() => {
        return participants?.docs.find(p => p.id === user?.uid)?.data() as Participant | undefined;
    }, [participants, user]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user && roomData && !participantsLoading) {
            if(currentUserParticipant) {
                setHasJoined(true);
            }
        }
    }, [user, authLoading, router, roomData, participantsLoading, currentUserParticipant]);

    const goBack = () => router.push('/');


    if (authLoading || roomLoading || participantsLoading) {
        return <div className="flex h-screen items-center justify-center"><LoaderCircle className="h-10 w-10 animate-spin" /></div>;
    }

    if (roomError) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load room data.' });
        router.push('/');
        return null;
    }

    if (!roomData) {
        return <div className="flex h-screen items-center justify-center"><p>Room not found.</p></div>;
    }

    if (user && !hasJoined) {
        return <SetupScreen user={user} room={roomData as SyncRoom} roomId={roomId} onJoin={() => setHasJoined(true)} />;
    }

    return (
        <div className="flex h-screen bg-muted/40">
            {/* Left Panel - Participants */}
            <aside className="w-1/4 min-w-[250px] bg-background border-r flex flex-col">
                <header className="p-4 border-b">
                     <Button variant="ghost" size="sm" onClick={goBack} className="mb-2">
                        <ArrowLeft className="mr-2 h-4 w-4"/>
                        Back to SyncHub
                    </Button>
                    <h2 className="text-lg font-semibold flex items-center gap-2"><Users /> Participants ({participants?.docs.length})</h2>
                </header>
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {participants?.docs.map(doc => {
                            const p = doc.data() as Participant;
                            const isCurrentUser = p.uid === user?.uid;
                            return (
                                <div key={p.uid} className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="font-semibold truncate">{p.name} {isCurrentUser && '(You)'}</p>
                                        <p className="text-xs text-muted-foreground truncate">{getAzureLanguageLabel(p.selectedLanguage)}</p>
                                    </div>
                                    {isCurrentUser && <Mic className="h-4 w-4 text-green-500" />}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
                 <footer className="p-4 border-t">
                    <p className="font-bold text-lg">{roomData.topic}</p>
                    <p className="text-sm text-muted-foreground">Meeting Room</p>
                </footer>
            </aside>

            {/* Right Panel - Chat and Controls */}
            <main className="flex-1 flex flex-col">
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                     <ScrollArea className="flex-grow pr-4 -mr-4">
                        <div className="space-y-4">
                            {messages?.docs.map(doc => {
                                const msg = doc.data() as RoomMessage;
                                const isOwnMessage = msg.speakerUid === user?.uid;
                                return (
                                    <div key={doc.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                        {!isOwnMessage && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{msg.speakerName.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                                            {!isOwnMessage && <p className="text-xs font-bold mb-1">{msg.speakerName}</p>}
                                            <p>{msg.text}</p>
                                            <p className="text-xs opacity-70 mt-1 text-right">{doc.data().createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                             <div ref={messagesEndRef} />
                        </div>
                         {messagesLoading && <LoaderCircle className="mx-auto my-4 h-6 w-6 animate-spin" />}
                         {!messagesLoading && messages?.empty && (
                            <div className="text-center text-muted-foreground py-8">
                                <p>No messages yet. Be the first to speak!</p>
                            </div>
                         )}
                    </ScrollArea>
                </div>
                <div className="p-4 border-t bg-background flex items-center gap-4">
                    <Button size="lg" className="rounded-full w-24 h-24 text-lg">
                        <Mic className="h-10 w-10"/>
                    </Button>
                    <div className="flex-1">
                        <p className="font-semibold text-muted-foreground">Press and hold the mic to talk</p>
                    </div>
                </div>
            </main>
        </div>
    );
}

