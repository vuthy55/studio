
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, orderBy, serverTimestamp, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch, where, Timestamp } from 'firebase/firestore';
import { useDocumentData, useCollection } from 'react-firebase-hooks/firestore';

import type { SyncRoom, Participant, BlockedUser, RoomMessage } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel, mapAzureCodeToLanguageCode } from '@/lib/azure-languages';
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
import { LoaderCircle, Mic, ArrowLeft, Users, Send, User, Languages, LogIn, XCircle, Crown, LogOut, ShieldX, UserCheck, UserX as RemoveUserIcon, ShieldQuestion, MicOff, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import useLocalStorage from '@/hooks/use-local-storage';


function SetupScreen({ user, room, roomId, onJoin }: { user: any; room: SyncRoom; roomId: string; onJoin: (joinTime: Timestamp) => void }) {
    const router = useRouter();
    const [name, setName] = useState(user.displayName || user.email?.split('@')[0] || 'Participant');
    const [language, setLanguage] = useLocalStorage<AzureLanguageCode | ''>('preferredSpokenLanguage', '');
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
            const joinTime = Timestamp.now();
            const participantData: Participant = {
                uid: user.uid,
                name: name,
                email: user.email!,
                selectedLanguage: language,
                isMuted: false,
                joinedAt: joinTime
            };
            await setDoc(participantRef, participantData);
            onJoin(joinTime);
        } catch (error) {
            console.error("Error joining room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    };
    
    const handleCancel = () => {
        router.push('/?tab=sync-online');
    }

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
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
                    <Button onClick={handleJoin} disabled={isJoining}>
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
    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});

    const [joinTimestamp, setJoinTimestamp] = useState<Timestamp | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [emailsToInvite, setEmailsToInvite] = useState('');
    const [isSendingInvites, setIsSendingInvites] = useState(false);
    
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const processedMessages = useRef(new Set<string>());


     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    const { presentParticipants, absentParticipantEmails } = useMemo(() => {
        if (!roomData || !participantsCollection) {
            return { presentParticipants: [], absentParticipantEmails: [] };
        }
        const presentUids = new Set(participantsCollection.docs.map(doc => doc.id));
        const present = participantsCollection.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant & { id: string }));
        const absent = roomData.invitedEmails.filter((email: string) => {
             return !participantsCollection.docs.some(p => p.data().email === email);
        });
        
        return { presentParticipants: present, absentParticipantEmails: absent };

    }, [roomData, participantsCollection]);


    const currentUserParticipant = useMemo(() => {
        return participantsCollection?.docs.find(p => p.id === user?.uid)?.data() as Participant | undefined;
    }, [participantsCollection, user]);

    // This effect runs once the user has successfully joined and sets the timestamp.
    useEffect(() => {
        if(currentUserParticipant?.joinedAt) {
            setJoinTimestamp(currentUserParticipant.joinedAt);
        }
    }, [currentUserParticipant]);


    const isCurrentUserEmcee = useMemo(() => {
        return user?.email && roomData?.emceeEmails?.includes(user.email);
    }, [user, roomData]);

    const isRoomCreator = useCallback((uid: string) => {
        return uid === roomData?.creatorUid;
    }, [roomData]);
    
    // Listen for mute status
    useEffect(() => {
        if (currentUserParticipant?.isMuted) {
            abortRecognition();
            setIsListening(false);
            toast({
                variant: 'destructive',
                title: "You've been muted",
                description: "An emcee has muted your microphone.",
            });
        }
    }, [currentUserParticipant?.isMuted, toast]);

    // Handle being removed from the room
    useEffect(() => {
        if (isExiting || !joinTimestamp) return; // Don't run this logic if the user is exiting voluntarily or hasn't joined

        const isStillParticipant = participantsCollection?.docs.some(doc => doc.id === user?.uid);

        if (!isStillParticipant && !participantsLoading) {
            toast({
                variant: 'destructive',
                title: 'You were removed',
                description: 'An emcee has removed you from the room.',
                duration: 5000,
            });
            router.push('/?tab=sync-online');
        }
    }, [participantsCollection, joinTimestamp, participantsLoading, user, router, toast, isExiting]);


    // Gracefully exit if room is closed or user is blocked
    useEffect(() => {
        if (roomData?.status === 'closed') {
            toast({
                title: 'Meeting Ended',
                description: 'This room has been closed by the emcee.',
                duration: 5000,
            });
            router.push('/?tab=sync-online');
        }
        if (user && roomData?.blockedUsers?.some((bu: BlockedUser) => bu.uid === user.uid)) {
            toast({
                variant: 'destructive',
                title: 'Access Denied',
                description: 'You have been blocked from this room.',
                duration: 5000
            });
            router.push('/?tab=sync-online');
        }
    }, [roomData, user, router, toast]);

    // --- NEW: Manual Message Listener ---
    useEffect(() => {
        if (!joinTimestamp) return; // Only listen for messages after we have a join timestamp

        setMessagesLoading(true);

        const q = query(messagesRef, where("createdAt", ">", joinTimestamp));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newMessages: RoomMessage[] = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    newMessages.push({ id: change.doc.id, ...change.doc.data() } as RoomMessage);
                }
            });

            if (newMessages.length > 0) {
                 setMessages(prevMessages => [...prevMessages, ...newMessages]);
            }
            setMessagesLoading(false);
        }, (error) => {
            console.error("Error listening to messages:", error);
            setMessagesLoading(false);
            // This might indicate a permissions issue still, so we toast
            toast({ variant: 'destructive', title: 'Message Error', description: 'Could not fetch new messages.'});
        });

        // Cleanup function to detach the listener when the component unmounts or joinTimestamp changes
        return () => unsubscribe();

    }, [joinTimestamp, messagesRef, toast]);


    // Handle incoming messages for translation and TTS
    useEffect(() => {
        if (!messages.length || !user || !currentUserParticipant?.selectedLanguage) return;

        const processMessage = async (msg: RoomMessage) => {
            if (msg.speakerUid === user.uid || processedMessages.current.has(msg.id)) {
                return;
            }
            processedMessages.current.add(msg.id);
            
            try {
                setIsSpeaking(true);
                
                const fromLangSimple = mapAzureCodeToLanguageCode(msg.speakerLanguage);
                const toLangSimple = mapAzureCodeToLanguageCode(currentUserParticipant.selectedLanguage!);
                
                const translated = await translateText({
                    text: msg.text,
                    fromLanguage: fromLangSimple,
                    toLanguage: toLangSimple,
                });

                setTranslatedMessages(prev => ({...prev, [msg.id]: translated.translatedText}));
                
                const { audioDataUri } = await generateSpeech({ 
                    text: translated.translatedText, 
                    lang: currentUserParticipant.selectedLanguage!,
                });
                
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.src = audioDataUri;
                    await audioPlayerRef.current.play();
                    await new Promise(resolve => audioPlayerRef.current!.onended = resolve);
                }
            } catch(e: any) {
                console.error("Error processing message:", e);
                toast({ variant: 'destructive', title: 'Playback Error', description: `Could not play audio for a message.`});
            } finally {
                setIsSpeaking(false);
            }
        };
        
        const playQueue = async () => {
             for (const msg of messages) {
                await processMessage(msg);
            }
        };
        
        playQueue();

    }, [messages, user, currentUserParticipant, toast]);


    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user && roomData && !participantsLoading) {
            if (roomData.blockedUsers?.some((bu: BlockedUser) => bu.uid === user.uid)) {
                 toast({ variant: 'destructive', title: 'Access Denied', description: 'You have been blocked from this room.' });
                 router.push('/?tab=sync-online');
                 return;
            }
            if (roomData.status === 'closed') {
                toast({ title: 'Room Closed', description: 'This room is no longer active.' });
                router.push('/?tab=sync-online');
                return;
            }

            const isParticipant = participantsCollection?.docs.some(p => p.id === user.uid);
            if (isParticipant) {
                const participantData = participantsCollection?.docs.find(p => p.id === user.uid)?.data();
                if(participantData?.joinedAt) {
                    setJoinTimestamp(participantData.joinedAt);
                }
            }
        }
    }, [user, authLoading, router, roomData, participantsCollection, participantsLoading, toast]);

    const handleExitRoom = async () => {
        if (!user) return;
        setIsExiting(true); // Set the flag to indicate voluntary exit
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            await deleteDoc(participantRef);
            router.push('/?tab=sync-online');
        } catch (error) {
            console.error("--- DEBUG: Error leaving room ---");
            console.error("User UID:", user.uid);
            console.error("Room ID:", roomId);
            console.error("Full Firebase Error Object:", error);
            toast({
                variant: 'destructive',
                title: 'Error Exiting',
                description: 'Could not leave room. Check console for details.',
                duration: 10000
            });
            setIsExiting(false); // Reset flag on error
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
    
    const handleSendInvites = async () => {
        const emails = emailsToInvite.split(/[ ,]+/).map(e => e.trim()).filter(Boolean);
        if (emails.length === 0) {
            toast({ variant: 'destructive', title: 'No Emails', description: 'Please enter at least one email address.' });
            return;
        }

        setIsSendingInvites(true);
        try {
            await updateDoc(roomRef, {
                invitedEmails: arrayUnion(...emails)
            });
            toast({ title: 'Invites Sent', description: 'The new participants can now join the room from their Sync Online tab.' });
            setEmailsToInvite('');
            setIsInviteDialogOpen(false);
        } catch (error) {
            console.error('Error sending invites:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not send invitations.' });
        } finally {
            setIsSendingInvites(false);
        }
    };

    const handleMicPress = async () => {
        if (!currentUserParticipant?.selectedLanguage || currentUserParticipant?.isMuted) return;

        setIsListening(true);
        try {
            const recognizedText = await recognizeFromMic(currentUserParticipant.selectedLanguage);
            
            if (recognizedText) {
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
    
    const handleMuteToggle = async (participantId: string, currentMuteStatus: boolean) => {
        if (!isCurrentUserEmcee) return;
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', participantId);
            await updateDoc(participantRef, { isMuted: !currentMuteStatus });
            toast({ title: `User ${currentMuteStatus ? 'Unmuted' : 'Muted'}`, description: `The participant's microphone status has been updated.` });
        } catch (error) {
            console.error("Error toggling mute:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update mute status.' });
        }
    };

    const handleRemoveParticipant = async (participant: Participant) => {
        if (!isCurrentUserEmcee) return;
        try {
            const batch = writeBatch(db);
            const userToBlock: BlockedUser = { uid: participant.uid, email: participant.email };

            // Add user's UID to the blocked list
            batch.update(roomRef, {
                blockedUsers: arrayUnion(userToBlock)
            });

            // Delete participant from subcollection
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', participant.uid);
            batch.delete(participantRef);
            
            await batch.commit();

            toast({ title: 'User Removed & Blocked', description: `${participant.name} has been removed from the room and cannot re-enter.` });
        } catch (error) {
            console.error("Error removing participant:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not remove the participant.' });
        }
    };


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
        if (!isCurrentUserEmcee) return;
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

    if (user && !joinTimestamp) {
        return <SetupScreen user={user} room={roomData as SyncRoom} roomId={roomId} onJoin={(joinTime) => setJoinTimestamp(joinTime)} />;
    }

    return (
        <div className="flex h-screen bg-muted/40">
            {/* Left Panel - Participants */}
            <aside className="w-1/4 min-w-[320px] bg-background border-r flex flex-col">
                <header className="p-4 border-b space-y-2">
                     <div className="bg-primary/10 p-3 rounded-lg">
                        <p className="font-bold text-lg text-primary">{roomData.topic}</p>
                        <p className="text-sm text-primary/80">Sync Room</p>
                     </div>
                     <div className="flex items-center justify-between pt-2">
                         <h2 className="text-lg font-semibold flex items-center gap-2"><Users /> Participants</h2>
                        {isCurrentUserEmcee && (
                            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm"><UserPlus className="mr-2 h-4 w-4"/> Invite</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Invite More People</DialogTitle>
                                        <DialogDescription>
                                            Enter email addresses separated by commas to invite them to this room.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-2">
                                        <Label htmlFor="emails-to-invite">Emails</Label>
                                        <Textarea 
                                            id="emails-to-invite" 
                                            value={emailsToInvite}
                                            onChange={(e) => setEmailsToInvite(e.target.value)}
                                            placeholder="friend1@example.com, friend2@example.com"
                                        />
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                                        <Button onClick={handleSendInvites} disabled={isSendingInvites}>
                                            {isSendingInvites && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                            Send Invites
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                     </div>
                </header>
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
                         <h3 className="font-semibold text-sm flex items-center gap-2 text-green-600"><UserCheck/> Present ({presentParticipants.length})</h3>
                        {presentParticipants.map(p => {
                            const isCurrentUser = p.uid === user?.uid;
                            const isEmcee = roomData?.emceeEmails?.includes(p.email);
                            const isCreator = isRoomCreator(p.uid);
                            const canBeModified = isCurrentUserEmcee && !isCreator && !isCurrentUser;
                             const canBeDemoted = isCurrentUserEmcee && !isCreator && isEmcee;

                            return (
                                <div key={p.id} className="flex items-center gap-3 group p-2 rounded-md hover:bg-muted/50">
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
                                    
                                     {p.isMuted && <MicOff className="h-4 w-4 text-red-500"/>}
                                    {isListening && isCurrentUser && <Mic className="h-4 w-4 text-green-500 animate-pulse" />}

                                    {canBeModified && (
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TooltipProvider>
                                                {!isEmcee ? (
                                                     <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePromoteToEmcee(p.email)}>
                                                                <ShieldCheck className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Promote to Emcee</p></TooltipContent>
                                                    </Tooltip>
                                                ) : canBeDemoted && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDemoteEmcee(p.email)}>
                                                                <ShieldX className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Demote Emcee</p></TooltipContent>
                                                    </Tooltip>
                                                )}
                                               
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMuteToggle(p.id, !!p.isMuted)}>
                                                            <MicOff className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>{p.isMuted ? 'Unmute' : 'Mute'} Participant</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            <AlertDialog>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <AlertDialogTrigger asChild>
                                                            <TooltipTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                                                    <RemoveUserIcon className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                        </AlertDialogTrigger>
                                                        <TooltipContent><p>Remove Participant</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Remove {p.name}?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently remove and block {p.name} from the room. They will not be able to rejoin.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleRemoveParticipant(p as Participant)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            Remove & Block
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    )}

                                </div>
                            );
                        })}
                    </div>
                    {absentParticipantEmails.length > 0 && (
                        <div className="p-4 space-y-2">
                             <Separator />
                             <h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground pt-2"><RemoveUserIcon/> Invited ({absentParticipantEmails.length})</h3>
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
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="w-full">
                                    <ShieldX className="mr-2 h-4 w-4"/>
                                    End Meeting
                                </Button>
                            </AlertDialogTrigger>
                             <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>End Meeting for All?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will close the room for all participants. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleEndMeeting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        End Meeting
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </footer>
            </aside>

            {/* Right Panel - Chat and Controls */}
            <main className="flex-1 flex flex-col">
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                     <ScrollArea className="flex-grow pr-4 -mr-4">
                        <div className="space-y-4">
                            {messages.map((msg) => {
                                const isOwnMessage = msg.speakerUid === user?.uid;
                                const displayText = isOwnMessage ? msg.text : (translatedMessages[msg.id] || `Translating from ${getAzureLanguageLabel(msg.speakerLanguage)}...`);

                                return (
                                    <div key={msg.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                        {!isOwnMessage && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{msg.speakerName.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                                            {!isOwnMessage && <p className="text-xs font-bold mb-1">{msg.speakerName}</p>}
                                            <p>{displayText}</p>
                                            <p className="text-xs opacity-70 mt-1 text-right">{msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                             <div ref={messagesEndRef} />
                        </div>
                         {messagesLoading && <LoaderCircle className="mx-auto my-4 h-6 w-6 animate-spin" />}
                         {!messagesLoading && messages?.length === 0 && (
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
                        disabled={isSpeaking || currentUserParticipant?.isMuted}
                        title={currentUserParticipant?.isMuted ? 'You are muted' : 'Press to talk'}
                    >
                        {currentUserParticipant?.isMuted ? <MicOff className="h-10 w-10"/> : (isListening ? <XCircle className="h-10 w-10"/> : <Mic className="h-10 w-10"/>)}
                    </Button>
                    <div className="flex-1">
                        <p className="font-semibold text-muted-foreground">
                            {currentUserParticipant?.isMuted ? "You are muted by an emcee." : (isListening ? "Listening..." : (isSpeaking ? "Playing incoming audio..." : "Press the mic to talk"))}
                        </p>
                    </div>
                </div>
                 <audio ref={audioPlayerRef} className="hidden" />
            </main>
        </div>
    );
}
