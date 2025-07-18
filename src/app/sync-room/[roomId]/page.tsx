
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
    <Tooltip>
        <TooltipTrigger asChild>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-accent cursor-help">
                <path d="M12.378 1.602a.75.75 0 00-.756 0L3.34 6.347a.75.75 0 00-.34.654v4.994c0 4.14 2.654 7.822 6.499 9.422a.75.75 0 00.518 0c3.845-1.6 6.499-5.282 6.499-9.422V7.001a.75.75 0 00-.34-.654L12.378 1.602zM12 7.5a.75.75 0 01.75.75v3.626a.75.75 0 01-1.5 0V8.25a.75.75 0 01.75-.75zM12 15a1 1 0 100-2 1 1 0 000 2z" />
                <path d="M12 7.5a.75.75 0 01.75.75v3.626a.75.75 0 01-1.5 0V8.25a.75.75 0 01.75-.75zM11.25 12a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" clipRule="evenodd" transform="rotate(90 12 12.75)" />
                <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">E</text>
            </svg>
        </TooltipTrigger>
        <TooltipContent>
            <p>Emcee</p>
        </TooltipContent>
    </Tooltip>
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
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    
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


    const handleStopMic = useCallback(() => {
        if (recognizerRef.current) {
            setIsCoolingDown(true);
            console.log("Stopping mic and closing recognizer...");
            recognizerRef.current.close();
            recognizerRef.current = null;
            console.log("Recognizer instance destroyed (set to null).");

            setTimeout(() => {
                setIsCoolingDown(false);
                console.log("Mic cool-down finished. Ready for next use.");
            }, 1500); // 1.5 second cool-down period
        }
        const roomRef = doc(db, 'syncRooms', roomId);
        updateDoc(roomRef, { activeSpeakerUid: null }).catch(err => {
            console.error("Failed to update active speaker to null in Firestore:", err);
        });
        setMicStatus('idle');
    }, [roomId]);


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
                    if (roomData.activeSpeakerUid && roomData.activeSpeakerUid !== user?.uid) {
                        setMicStatus('locked');
                    } else if (!roomData.activeSpeakerUid) {
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
            handleStopMic(); // Ensure cleanup on unmount
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Only re-run when room changes. lastMessage is now managed internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, user?.uid]);


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
        if (!user || !room || !currentUserParticipant || isCoolingDown) return;
        
        if (micStatus === 'listening') {
             handleStopMic();
             return;
        }
        
        if (micStatus === 'idle' || isCurrentUserEmcee) {
            const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
            const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
        
            if (!azureKey || !azureRegion) {
                console.error("Azure credentials not configured.");
                toast({ variant: "destructive", title: "Configuration Error", description: "Azure credentials are not set up." });
                return;
            }
            
            try {
                console.log("Creating new SpeechRecognizer instance...");
                const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
                speechConfig.speechRecognitionLanguage = currentUserParticipant.selectedLanguage;
                const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
                const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
                
                recognizerRef.current = recognizer;

                recognizer.recognized = async (s, e) => {
                    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
                        console.log("Speech recognized:", e.result.text);
                        setMicStatus('processing');
        
                        const newMessageRef = doc(collection(db, `syncRooms/${roomId}/messages`));
                        const newMessage: RoomMessage = {
                            id: newMessageRef.id,
                            text: e.result.text,
                            speakerName: currentUserParticipant.name,
                            speakerUid: currentUserParticipant.uid,
                            speakerLanguage: currentUserParticipant.selectedLanguage,
                            createdAt: serverTimestamp()
                        };
        
                        await setDoc(newMessageRef, newMessage);
                        handleStopMic();
                    } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                        console.log("No speech could be recognized.");
                        handleStopMic();
                    }
                };
        
                recognizer.canceled = (s, e) => {
                    console.error(`CANCELED: Reason=${e.reason}, Details=${e.errorDetails}`);
                    if (e.reason === sdk.CancellationReason.Error) {
                        toast({ variant: 'destructive', title: 'Recognition Error', description: e.errorDetails });
                    }
                    handleStopMic();
                };
        
                recognizer.sessionStopped = (s, e) => {
                    console.log("Recognition session stopped.");
                    handleStopMic();
                };

                const roomRef = doc(db, 'syncRooms', roomId);
                await updateDoc(roomRef, { activeSpeakerUid: user.uid });
                
                console.log("Starting continuous recognition...");
                recognizer.startContinuousRecognitionAsync(
                    () => { 
                        console.log("Recognition started successfully.");
                        setMicStatus('listening'); 
                    },
                    (err) => {
                        console.error("Error starting recognition:", err);
                        toast({ variant: "destructive", title: "Mic Error", description: `Could not start microphone: ${err}` });
                        handleStopMic();
                    }
                );
            } catch (error: any) {
                console.error("Error during mic tap setup:", error);
                toast({ variant: "destructive", title: "Error", description: `Could not start microphone: ${error.message}` });
                handleStopMic();
            }
        }
    };
    
    // --- Room Management Handlers ---

    const handleLeaveRoom = async () => {
        if (!user) return;
        try {
            if (room?.activeSpeakerUid === user.uid) {
                 handleStopMic();
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
            };
            await setDoc(doc(db, `syncRooms/${roomId}/participants`, user.uid), newParticipant, { merge: true });
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
        if (isCoolingDown) return 'Mic cooling down...';
         switch (micStatus) {
            case 'listening': return 'Listening... (Tap to Stop)';
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
                                            <h3 className="font-semibold mb-2 text-red-600">Absent</h3>
                                            <ul className="space-y-1">
                                                {absentEmails.map(email => (
                                                    <li key={email} className="text-sm text-muted-foreground">{email}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {participants.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold mb-2 text-green-600">Present</h3>
                                            <ul className="space-y-1">
                                                {participants.map(p => (
                                                    <li key={p.uid} className="text-sm text-foreground">{p.name}</li>
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
                                {isEmcee && <EmceeIcon />}
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
                                 {((isCurrentUserEmcee && isEmcee && !isOwner) || (isOwner && isEmcee && !isCurrentUser)) && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
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
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Remove as Emcee</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </Card>
                    )})}
                </div>
                
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                size="lg" 
                                className={cn("rounded-full w-32 h-32 text-lg shadow-2xl transition-all duration-200",
                                    micStatus === 'listening' && 'bg-green-500 hover:bg-green-600 scale-110',
                                    micStatus === 'processing' && 'bg-blue-500 hover:bg-blue-600',
                                    isCoolingDown && 'bg-yellow-500 hover:bg-yellow-600 cursor-wait',
                                    (micStatus === 'locked' && !isCurrentUserEmcee) && 'bg-muted text-muted-foreground cursor-not-allowed'
                                )}
                                onClick={handleMicTap}
                                disabled={(micStatus === 'locked' && !isCurrentUserEmcee) || micStatus === 'processing' || isCoolingDown}
                                aria-label={getMicButtonTooltip()}
                            >
                                {isCoolingDown ? <LoaderCircle className="h-10 w-10 animate-spin" /> : getMicButtonContent()}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                           <p>{getMicButtonTooltip()}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider>
    )
}

export default function SyncRoomPage() {
    return <SyncRoomPageContent />;
}

    