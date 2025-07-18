
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, deleteDoc, updateDoc, writeBatch, addDoc, serverTimestamp, orderBy, limit, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { SyncRoom, Participant, RoomMessage } from '@/lib/types';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { LoaderCircle, Mic, LogOut, User as UserIcon, Volume2, CheckCircle, Menu, ArrowUpCircle, Users, ArrowDownCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type MicStatus = 'idle' | 'listening' | 'processing' | 'locked';

const EmceeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-amber-500">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v.093c-1.72.23-3.264 1.25-4.225 2.816a.75.75 0 001.21.878A4.484 4.484 0 0112 7.5h.005a4.5 4.5 0 014.495 4.5v.005c0 1.933-1.226 3.585-2.995 4.293a.75.75 0 00-.51 1.34c.813.435 1.713.662 2.65.662a5.992 5.992 0 005.99-5.99V12a5.992 5.992 0 00-5.99-5.913V6z" clipRule="evenodd" />
        <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
    </svg>
);


function SyncRoomPageContent() {
    const params = useParams();
    const roomId = params.roomId as string;
    const [user, authLoading] = useAuthState(auth);
    const { toast } = useToast();
    const router = useRouter();
    const { isMobile } = useSidebar();

    const [room, setRoom] = useState<SyncRoom | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Join form state
    const [userLanguage, setUserLanguage] = useState<AzureLanguageCode | ''>('');
    const [isJoining, setIsJoining] = useState(false);
    
    // In-room state
    const [micStatus, setMicStatus] = useState<MicStatus>('idle');
    const [lastMessage, setLastMessage] = useState<RoomMessage | null>(null);
    const [isUpdatingParticipant, setIsUpdatingParticipant] = useState<string | null>(null);
    
    const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);
    const audioQueue = useRef<RoomMessage[]>([]);
    const isPlayingAudio = useRef(false);

    const currentUserParticipant = useMemo(() => participants.find(p => p.uid === user?.uid), [participants, user]);
    const isCurrentUserEmcee = useMemo(() => {
        if (!room || !user) return false;
        return room.emceeUids.includes(user.uid);
    }, [room, user]);

    const hasJoined = useMemo(() => {
        if (!user) return false;
        return participants.some(p => p.uid === user.uid);
    }, [user, participants]);

    // --- Data and Auth Effects ---

    useEffect(() => {
        if (!roomId || authLoading) return;
        if (!user) {
            router.push(`/login?redirect=/sync-room/${roomId}`);
            return;
        }

        const roomRef = doc(db, 'syncRooms', roomId);
        const unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const roomData = { id: docSnap.id, ...docSnap.data() } as SyncRoom;
                if (!roomData.invitedEmails.includes(user.email!)) {
                    router.push('/');
                    toast({ variant: 'destructive', title: 'Access Denied', description: 'You are not invited to this room.' });
                } else {
                    setRoom(roomData);
                    if (roomData.activeSpeakerUid) {
                        setMicStatus(roomData.activeSpeakerUid === user?.uid ? 'listening' : 'locked');
                    } else {
                        setMicStatus('idle');
                    }
                }
            } else {
                router.push('/');
                toast({ variant: 'destructive', title: 'Not Found', description: 'This room does not exist.' });
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching room:", err);
            router.push('/');
            toast({ variant: 'destructive', title: 'Error', description: 'Could not retrieve room information.' });
            setLoading(false);
        });

        const participantsRef = collection(db, 'syncRooms', roomId, 'participants');
        const participantsQuery = query(participantsRef);
        const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
            const parts = snapshot.docs.map(doc => doc.data() as Participant);
            setParticipants(parts);
        });

        return () => {
            unsubscribeRoom();
            unsubscribeParticipants();
            recognizerRef.current?.close();
        }
    }, [roomId, user, authLoading, router, toast]);
    
    useEffect(() => {
        if (!room) return; 

        const messagesRef = collection(db, 'syncRooms', room.id, 'messages');
        const messagesQuery = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
        const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
            if (!snapshot.empty) {
                const newMessage = snapshot.docs[0].data() as RoomMessage;
                if (newMessage.id !== lastMessage?.id) {
                    setLastMessage(newMessage);
                    // Prevent self-echo
                    if (newMessage.speakerUid !== user?.uid) {
                        audioQueue.current.push(newMessage);
                        processAudioQueue();
                    }
                }
            }
        }, err => {
             console.error("Message listener error:", err);
        });

        return () => {
            unsubscribeMessages();
        }
    }, [room, lastMessage, user?.uid]);


    // --- Audio Playback Logic ---

    const processAudioQueue = async () => {
        if (isPlayingAudio.current || audioQueue.current.length === 0) {
            return;
        }
        isPlayingAudio.current = true;
        
        const messageToPlay = audioQueue.current.shift();
        if (!messageToPlay || !currentUserParticipant) {
            isPlayingAudio.current = false;
            return;
        }

        try {
            const speakerLangLabel = azureLanguages.find(l => l.value === messageToPlay.speakerLanguage)?.label || messageToPlay.speakerLanguage;
            const listenerLangLabel = azureLanguages.find(l => l.value === currentUserParticipant.selectedLanguage)?.label || currentUserParticipant.selectedLanguage;
            let textToSpeak = messageToPlay.text;

            if (speakerLangLabel !== listenerLangLabel) {
                 const translationResult = await translateText({
                    text: messageToPlay.text,
                    fromLanguage: speakerLangLabel,
                    toLanguage: listenerLangLabel,
                });
                textToSpeak = translationResult.translatedText;
            }

            const { audioDataUri } = await generateSpeech({ 
                text: textToSpeak, 
                lang: currentUserParticipant.selectedLanguage || 'en-US'
            });
            const audio = new Audio(audioDataUri);
            await audio.play();

            audio.onended = () => {
                isPlayingAudio.current = false;
                processAudioQueue(); 
            };
        } catch(e) {
            console.error("Error processing audio queue: ", e);
            toast({ variant: 'destructive', title: 'Audio Error', description: 'Could not play back audio.' });
            isPlayingAudio.current = false;
            processAudioQueue();
        }
    }

    // --- Speech Recognition Logic ---

    const handleMicTap = async () => {
        if (!user || !room || !currentUserParticipant || (micStatus !== 'idle' && !isCurrentUserEmcee)) return;
        
        const roomRef = doc(db, 'syncRooms', roomId);
        
        try {
            await updateDoc(roomRef, { activeSpeakerUid: user.uid });
            setMicStatus('listening');
            
            const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
            const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
            if (!azureKey || !azureRegion) throw new Error("Azure credentials not configured.");
            
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = currentUserParticipant.selectedLanguage;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            recognizerRef.current = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            recognizerRef.current.recognized = async (s, e) => {
                if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
                    recognizerRef.current?.stopContinuousRecognitionAsync();
                    setMicStatus('processing');
                    
                    const newMessageRef = doc(collection(db, `syncRooms/${roomId}/messages`));
                    const newMessage: RoomMessage = {
                        id: newMessageRef.id,
                        text: e.result.text,
                        speakerName: currentUserParticipant.name,
                        speakerUid: user.uid,
                        speakerLanguage: currentUserParticipant.selectedLanguage,
                        createdAt: serverTimestamp()
                    };
                    
                    await setDoc(newMessageRef, newMessage);
                    
                    await updateDoc(roomRef, { activeSpeakerUid: null });
                    setMicStatus('idle');
                }
            };
            
            recognizerRef.current.canceled = async (s, e) => {
                console.error(`CANCELED: Reason=${e.reason}`);
                if (e.reason === sdk.CancellationReason.Error) {
                    toast({ variant: 'destructive', title: 'Recognition Error', description: e.errorDetails });
                }
                await updateDoc(roomRef, { activeSpeakerUid: null });
                setMicStatus('idle');
            };

            recognizerRef.current.sessionStopped = async (s, e) => {
                if (micStatus === 'listening') {
                    await updateDoc(roomRef, { activeSpeakerUid: null });
                    setMicStatus('idle');
                }
            };

            recognizerRef.current.startContinuousRecognitionAsync();

        } catch (error: any) {
            console.error("Error during mic tap:", error);
            toast({ variant: "destructive", title: "Error", description: `Could not start microphone: ${error.message}` });
            await updateDoc(roomRef, { activeSpeakerUid: null });
            setMicStatus('idle');
        }
    };
    
    // --- Room Management Handlers ---

    const handleLeaveRoom = async () => {
        if (!user) return;
        try {
            if (room?.activeSpeakerUid === user.uid) {
                 await updateDoc(doc(db, 'syncRooms', roomId), { activeSpeakerUid: null });
            }
            const participantRef = doc(db, `syncRooms/${roomId}/participants`, user.uid);
            await deleteDoc(participantRef);
            toast({ title: "You have left the room." });
            router.push('/');
        } catch (error) {
            console.error("Error leaving room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not leave the room.' });
        }
    };

    const handleJoinRoom = async (e: React.FormEvent) => {
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
            };
            await setDoc(doc(db, `syncRooms/${roomId}/participants`, user.uid), newParticipant);
            toast({ title: 'Success', description: 'You have joined the room.' });
        } catch (error: any) {
            console.error("Error joining as registered user:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room: ' + error.message });
        } finally {
            setIsJoining(false);
        }
    };
    
    const handlePromoteToEmcee = async (participantUid: string) => {
        if (!isCurrentUserEmcee) return;
        setIsUpdatingParticipant(participantUid);
        try {
            const roomRef = doc(db, 'syncRooms', roomId);
            await updateDoc(roomRef, {
                emceeUids: arrayUnion(participantUid)
            });
            toast({ title: "Success", description: "Participant promoted to emcee." });
        } catch (error) {
            console.error("Error promoting emcee:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not promote participant." });
        } finally {
            setIsUpdatingParticipant(null);
        }
    };

    const handleDemoteEmcee = async (participantUid: string) => {
        if (!isCurrentUserEmcee && room?.creatorUid !== user?.uid) return;
        if (room?.creatorUid === participantUid) {
            toast({ variant: "destructive", title: "Action Not Allowed", description: "The room owner cannot be demoted." });
            return;
        }
        setIsUpdatingParticipant(participantUid);
        try {
            const roomRef = doc(db, 'syncRooms', roomId);
            await updateDoc(roomRef, {
                emceeUids: arrayRemove(participantUid)
            });
            toast({ title: "Success", description: "Emcee role has been removed." });
        } catch (error) {
            console.error("Error demoting emcee:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not demote participant." });
        } finally {
            setIsUpdatingParticipant(null);
        }
    };
    
    const getMicButtonContent = () => {
        switch (micStatus) {
            case 'listening': return <Volume2 className="h-12 w-12" />;
            case 'processing': return <CheckCircle className="h-12 w-12" />;
            case 'locked':
            case 'idle':
            default: return <Mic className="h-10 w-10" />;
        }
    }

    const getMicButtonTooltip = () => {
         switch (micStatus) {
            case 'listening': return 'Listening...';
            case 'processing': return 'Processing...';
            case 'locked': return isCurrentUserEmcee ? 'Tap to override' : 'Mic is locked by another user';
            case 'idle':
            default: return 'Tap to talk';
        }
    }

    const getPresentEmails = useMemo(() => {
        return participants.map(p => p.email);
    }, [participants]);

    const absentEmails = useMemo(() => {
        return room?.invitedEmails.filter(email => !getPresentEmails.includes(email)) ?? [];
    }, [room, getPresentEmails]);
    
    // --- Render Logic ---

    if (loading || authLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle>Authentication Required</CardTitle>
                        <CardDescription>You need to be logged in to join a sync room.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => router.push(`/login?redirect=/sync-room/${roomId}`)}>
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!hasJoined) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Avatar className="h-20 w-20 text-3xl mb-2">
                                <AvatarFallback>{user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <CardTitle>Join "{room?.topic || 'Room'}"</CardTitle>
                        <CardDescription>Welcome, {user.displayName || user.email}! Please select your spoken language to enter the room.</CardDescription>
                    </CardHeader>
                    <CardContent>
                            <form onSubmit={handleJoinRoom} className="space-y-4">
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
        <TooltipProvider>
            <div className="p-4 md:p-6 flex flex-col h-screen">
                <header className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        {isMobile && <SidebarTrigger><Menu /></SidebarTrigger>}
                        <div>
                            <h1 className="text-3xl font-bold font-headline">{room?.topic}</h1>
                            <p className="text-muted-foreground">Welcome to the Sync Room!</p>
                            {lastMessage && <p className="text-sm mt-2 italic">Last: "{lastMessage.text}" by {lastMessage.speakerName}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Users className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Participants</DialogTitle>
                                    <DialogDescription>List of invited users and their status.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 max-h-80 overflow-y-auto">
                                    {absentEmails.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold mb-2">Absent</h3>
                                            <ul className="space-y-1">
                                                {absentEmails.map(email => (
                                                    <li key={email} className="text-red-600">{email}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {participants.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold mb-2">Present</h3>
                                            <ul className="space-y-1">
                                                {participants.map(p => (
                                                    <li key={p.uid} className="text-green-600">{p.email} ({p.name})</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </DialogContent>
                        </Dialog>
                        <Button variant="ghost" onClick={handleLeaveRoom}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Leave Room
                        </Button>
                    </div>
                </header>

                <div className="flex-grow my-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {participants.map(p => {
                        const isEmcee = room?.emceeUids.includes(p.uid) ?? false;
                        const isCurrentUser = user.uid === p.uid;
                        const isOwner = room?.creatorUid === p.uid;

                        return (
                        <Card key={p.email} className={cn(
                            "flex flex-col items-center justify-between p-4 text-center border-4 relative",
                            room?.activeSpeakerUid === p.uid ? 'border-primary shadow-lg' : 'border-border'
                        )}>
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                                {isEmcee && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="cursor-help"><EmceeIcon /></span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Emcee</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {isUpdatingParticipant === p.uid && <LoaderCircle className="h-5 w-5 animate-spin" />}
                            </div>
                            <div className="flex flex-col items-center justify-center">
                                <Avatar className="h-16 w-16 text-2xl mb-2">
                                    <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <Mic className={cn("h-8 w-8 my-2", room?.activeSpeakerUid === p.uid ? 'text-primary' : 'text-muted-foreground' )} />
                                <p className="font-bold truncate w-full">{p.name}</p>
                            </div>
                            
                            <div className="w-full space-y-2 mt-4">
                                <p className="text-xs text-muted-foreground h-8 flex items-center justify-center border rounded-md">
                                    {azureLanguages.find(l => l.value === p.selectedLanguage)?.label ?? p.selectedLanguage}
                                </p>

                                {isCurrentUserEmcee && !isEmcee && (
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="w-full text-xs h-8"
                                        onClick={() => handlePromoteToEmcee(p.uid)}
                                        disabled={!!isUpdatingParticipant}
                                    >
                                        <ArrowUpCircle className="mr-2 h-4 w-4" />
                                        Promote
                                    </Button>
                                )}
                                 {((isCurrentUserEmcee && isEmcee && !isOwner) || (user.uid === room?.creatorUid && isEmcee && !isCurrentUser)) && (
                                    <Button 
                                        size="sm" 
                                        variant="destructive" 
                                        className="w-full text-xs h-8"
                                        onClick={() => handleDemoteEmcee(p.uid)}
                                        disabled={!!isUpdatingParticipant}
                                    >
                                        <ArrowDownCircle className="mr-2 h-4 w-4" />
                                        Demote
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )})}
                </div>
                
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <Button 
                        size="lg" 
                        className={cn("rounded-full w-32 h-32 text-lg shadow-2xl transition-all duration-200",
                            micStatus === 'listening' && 'bg-green-500 hover:bg-green-600 scale-110',
                            micStatus === 'processing' && 'bg-blue-500 hover:bg-blue-600',
                            (micStatus === 'locked' && !isCurrentUserEmcee) && 'bg-muted text-muted-foreground cursor-not-allowed'
                        )}
                        onClick={handleMicTap}
                        disabled={(micStatus === 'locked' && !isCurrentUserEmcee) || micStatus === 'processing'}
                    >
                        {getMicButtonContent()}
                    </Button>
                    <p className="text-sm text-muted-foreground mt-4">{getMicButtonTooltip()}</p>
                </div>
            </div>
        </TooltipProvider>
    )
}

export default function SyncRoomPage() {
    return <SyncRoomPageContent />;
}
