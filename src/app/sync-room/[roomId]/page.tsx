
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, orderBy, serverTimestamp, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useDocumentData, useCollection } from 'react-firebase-hooks/firestore';

import type { SyncRoom, Participant, RoomMessage } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { recognizeFromMic, abortRecognition } from '@/services/speech';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Mic, ArrowLeft, Users, Send, User, Languages, LogIn, XCircle, Crown, LogOut, ShieldX, UserCheck, UserX, ShieldQuestion } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';


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
    const [participantsCollection, participantsLoading] = useCollection(participantsRef);

    const messagesRef = useMemo(() => collection(db, 'syncRooms', roomId, 'messages'), [roomId]);
    const messagesQuery = useMemo(() => query(messagesRef, orderBy('createdAt', 'asc')), [messagesRef]);
    const [messages, messagesLoading] = useCollection(messagesQuery);

    const [hasJoined, setHasJoined] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});

    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const processedMessages = useRef(new Set<string>() as Set<string>);
    const lastMessageCount = useRef(0);


     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, translatedMessages]);
    
    const { presentParticipants, absentParticipantEmails } = useMemo(() => {
        if (!roomData || !participantsCollection) {
            return { presentParticipants: [], absentParticipantEmails: [] };
        }
        const presentUids = new Set(participantsCollection.docs.map(doc => doc.id));
        const present = participantsCollection.docs.map(doc => doc.data() as Participant);
        const absent = roomData.invitedEmails.filter((email: string) => {
             return !participantsCollection.docs.some(p => p.data().email === email);
        });
        
        return { presentParticipants: present, absentParticipantEmails: absent };

    }, [roomData, participantsCollection]);


    const currentUserParticipant = useMemo(() => {
        return participantsCollection?.docs.find(p => p.id === user?.uid)?.data() as Participant | undefined;
    }, [participantsCollection, user]);

    const isCurrentUserEmcee = useMemo(() => {
        return user?.email && roomData?.emceeEmails?.includes(user.email);
    }, [user, roomData]);

    const isRoomCreator = useCallback((email: string) => {
        const creatorEmail = presentParticipants.find(p => p.uid === roomData?.creatorUid)?.email;
        return email === creatorEmail;
    }, [presentParticipants, roomData]);


    // Gracefully exit if room is closed
    useEffect(() => {
        if (roomData?.status === 'closed') {
            toast({
                title: 'Meeting Ended',
                description: 'This room has been closed by the emcee.',
                duration: 5000,
            });
            router.push('/?tab=sync-online');
        }
    }, [roomData, router, toast]);

    // Handle incoming messages for translation and TTS
    useEffect(() => {
        if (!messages || !user || !hasJoined || !currentUserParticipant?.selectedLanguage || messages.docs.length === lastMessageCount.current) {
            return;
        }

        const newMessages = messages.docs.slice(lastMessageCount.current);
        lastMessageCount.current = messages.docs.length;

        const processMessage = async (doc: any) => {
            const msg = doc.data() as RoomMessage;
            const messageId = doc.id;

            if (processedMessages.current.has(messageId)) {
                return; // Skip already processed messages
            }

            processedMessages.current.add(messageId);
            
            if (msg.speakerUid === user.uid) {
                return; // Don't play back our own messages
            }
                
            try {
                setTranslatedMessages(prev => ({ ...prev, [messageId]: 'Translating...' }));

                const { translatedText } = await translateText({
                    text: msg.text,
                    fromLanguage: getAzureLanguageLabel(msg.speakerLanguage),
                    toLanguage: getAzureLanguageLabel(currentUserParticipant.selectedLanguage!),
                });
                
                setTranslatedMessages(prev => ({ ...prev, [messageId]: translatedText }));
                
                if (audioPlayerRef.current?.paused === false) {
                    await new Promise(resolve => {
                        if (audioPlayerRef.current) audioPlayerRef.current.onended = resolve;
                    });
                }

                setIsSpeaking(true);
                const { audioDataUri } = await generateSpeech({ 
                    text: translatedText, 
                    lang: currentUserParticipant.selectedLanguage!,
                });
                
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.src = audioDataUri;
                    await audioPlayerRef.current.play();
                    await new Promise(resolve => {
                        if (audioPlayerRef.current) {
                            audioPlayerRef.current.onended = () => resolve(true);
                        } else {
                            resolve(true);
                        }
                    });
                }
            } catch(e: any) {
                console.error("Error processing message:", e);
                setTranslatedMessages(prev => ({ ...prev, [messageId]: `Error: Could not translate message.` }));
                toast({ variant: 'destructive', title: 'Playback Error', description: `Could not play audio for a message.`});
            } finally {
                setIsSpeaking(false);
            }
        };

        newMessages.forEach(processMessage);

    }, [messages, user, hasJoined, currentUserParticipant, toast]);


    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user && roomData && !participantsLoading) {
            // Check if room is closed on initial load
            if (roomData.status === 'closed') {
                toast({ title: 'Room Closed', description: 'This room is no longer active.' });
                router.push('/?tab=sync-online');
                return;
            }

            const isParticipant = participantsCollection?.docs.some(p => p.id === user.uid);
            if (isParticipant) {
                // When joining, mark all current messages as processed to prevent re-playing history
                messages?.docs.forEach(doc => processedMessages.current.add(doc.id));
                lastMessageCount.current = messages?.docs.length || 0;
                setHasJoined(true);
            }
        }
    }, [user, authLoading, router, roomData, participantsCollection, participantsLoading, messages, toast]);

    const handleExitRoom = async () => {
        if (!user) return;
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            await deleteDoc(participantRef);
            router.push('/?tab=sync-online');
        } catch (error) {
            console.error("Error leaving room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not leave the room.' });
        }
    };
    
    const handleEndMeeting = async () => {
        if (!isCurrentUserEmcee) return;
        try {
            await updateDoc(roomRef, {
                status: 'closed',
                lastActivityAt: serverTimestamp(),
            });
            // The useEffect for room status will handle the redirect for all users
        } catch (error) {
            console.error("Error ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not end the meeting.' });
        }
    };

    const handleMicPress = async () => {
        if (!currentUserParticipant?.selectedLanguage) return;

        setIsListening(true);
        try {
            const recognizedText = await recognizeFromMic(currentUserParticipant.selectedLanguage);
            
            if (recognizedText) {
                 await updateDoc(roomRef, { lastActivityAt: serverTimestamp() });
                await addDoc(messagesRef, {
                    text: recognizedText,
                    speakerName: currentUserParticipant.name,
                    speakerUid: currentUserParticipant.uid,
                    speakerLanguage: currentUserParticipant.selectedLanguage,
                    createdAt: serverTimestamp(),
                });
            }
        } catch (error: any) {
             if (error.message !== "Recognition was aborted.") {
               toast({ variant: 'destructive', title: 'Recognition Failed', description: error.message });
            }
        } finally {
            setIsListening(false);
        }
    }

    const handlePromoteToEmcee = async (participantEmail: string) => {
        if (!isCurrentUserEmcee) return;
        try {
            await updateDoc(roomRef, {
                emceeEmails: arrayUnion(participantEmail)
            });
            toast({ title: 'Promotion Success', description: `${participantEmail} is now an emcee.` });
        } catch (error) {
            console.error("Error promoting emcee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not promote participant.' });
        }
    };

    const handleDemoteEmcee = async (participantEmail: string) => {
        try {
            await updateDoc(roomRef, {
                emceeEmails: arrayRemove(participantEmail)
            });
            toast({ title: 'Demotion Success', description: `${participantEmail} is no longer an emcee.` });
        } catch (error) {
            console.error("Error demoting emcee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not demote emcee.' });
        }
    };


    if (authLoading || roomLoading || participantsLoading) {
        return <div className="flex h-screen items-center justify-center"><LoaderCircle className="h-10 w-10 animate-spin" /></div>;
    }

    if (roomError) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load room data.' });
        router.push('/?tab=sync-online');
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
            <aside className="w-1/4 min-w-[280px] bg-background border-r flex flex-col">
                <header className="p-4 border-b space-y-2">
                     <div className="bg-primary/10 p-3 rounded-lg">
                        <p className="font-bold text-lg text-primary">{roomData.topic}</p>
                        <p className="text-sm text-primary/80">Sync Room</p>
                     </div>
                     <h2 className="text-lg font-semibold flex items-center gap-2 pt-2"><Users /> Participants</h2>
                </header>
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
                         <h3 className="font-semibold text-sm flex items-center gap-2 text-green-600"><UserCheck/> Present ({presentParticipants.length})</h3>
                        {presentParticipants.map(p => {
                            const isCurrentUser = p.uid === user?.uid;
                            const isEmcee = roomData?.emceeEmails?.includes(p.email);
                            const isCreator = isRoomCreator(p.email);

                            return (
                                <div key={p.uid} className="flex items-center gap-3 group p-1 rounded-md">
                                    <Avatar>
                                        <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="font-semibold truncate flex items-center gap-1.5">
                                            {isEmcee && <Crown className="h-4 w-4 text-amber-400"/>}
                                            {p.name} {isCurrentUser && '(You)'}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">{getAzureLanguageLabel(p.selectedLanguage)}</p>
                                    </div>
                                    
                                    {isCurrentUserEmcee && !isEmcee && (
                                         <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => handlePromoteToEmcee(p.email)}>
                                                        <Crown className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Promote to Emcee</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}

                                     {isCurrentUserEmcee && isEmcee && !isCreator && (
                                         <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => handleDemoteEmcee(p.email)}>
                                                        <ShieldQuestion className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Demote Emcee</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                    {isListening && isCurrentUser && <Mic className="h-4 w-4 text-green-500 animate-pulse" />}
                                </div>
                            );
                        })}
                    </div>
                    {absentParticipantEmails.length > 0 && (
                        <div className="p-4 space-y-2">
                             <Separator />
                             <h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground pt-2"><UserX/> Invited ({absentParticipantEmails.length})</h3>
                            {absentParticipantEmails.map(email => (
                                <div key={email} className="flex items-center gap-3 p-1 rounded-md opacity-60">
                                    <Avatar>
                                        <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                     <div className="flex-1 overflow-hidden">
                                         <p className="font-semibold truncate flex items-center gap-1.5">{email}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
                 <footer className="p-4 border-t flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExitRoom} className="w-full">
                        <LogOut className="mr-2 h-4 w-4"/>
                        Exit Room
                    </Button>
                    {isCurrentUserEmcee && (
                        <Button variant="destructive" size="sm" className="w-full" onClick={handleEndMeeting}>
                            <ShieldX className="mr-2 h-4 w-4"/>
                            End Meeting
                        </Button>
                    )}
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
                                const displayText = isOwnMessage ? msg.text : (translatedMessages[doc.id] || '');
                                
                                return (
                                    <div key={doc.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                        {!isOwnMessage && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{msg.speakerName.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                                            {!isOwnMessage && <p className="text-xs font-bold mb-1">{msg.speakerName}</p>}
                                            <p>{displayText}</p>
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
                    <Button 
                        size="lg" 
                        className={cn("rounded-full w-24 h-24 text-lg", isListening && "bg-destructive hover:bg-destructive/90")}
                        onClick={isListening ? abortRecognition : handleMicPress}
                        disabled={isSpeaking}
                    >
                        {isListening ? <XCircle className="h-10 w-10"/> : <Mic className="h-10 w-10"/>}
                    </Button>
                    <div className="flex-1">
                        <p className="font-semibold text-muted-foreground">
                            {isListening ? "Listening..." : (isSpeaking ? "Playing incoming audio..." : "Press the mic to talk")}
                        </p>
                    </div>
                </div>
                 <audio ref={audioPlayerRef} className="hidden" />
            </main>
        </div>
    );
}

    

    