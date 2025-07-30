
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, orderBy, serverTimestamp, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch, where, Timestamp, getDoc } from 'firebase/firestore';

import type { SyncRoom, Participant, BlockedUser, RoomMessage } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel, mapAzureCodeToLanguageCode } from '@/lib/azure-languages';
import { recognizeFromMic, abortRecognition } from '@/services/speech';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';
import { softDeleteRoom } from '@/actions/room';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import { sendRoomInviteEmail } from '@/actions/email';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Mic, Users, Send, User, Languages, LogIn, XCircle, Crown, LogOut, ShieldX, UserCheck, UserX as RemoveUserIcon, ShieldQuestion, MicOff, ShieldCheck, UserPlus, Coins, Clock, Info, Trash2, Save } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet"
import { Textarea } from '@/components/ui/textarea';
import useLocalStorage from '@/hooks/use-local-storage';
import { useUserData } from '@/context/UserDataContext';
import { Badge } from '@/components/ui/badge';


function SetupScreen({ user, room, roomId, onJoinSuccess }: { user: any; room: SyncRoom; roomId: string; onJoinSuccess: (joinTime: Timestamp) => void; }) {
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
            onJoinSuccess(joinTime);
        } catch (error) {
            console.error("Error joining room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    };
    
    const handleCancel = () => {
        router.push('/synchub?tab=sync-online');
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


function ParticipantsPanel({ 
    roomData,
    isCurrentUserEmcee,
    isInviteDialogOpen,
    setIsInviteDialogOpen,
    emailsToInvite,
    setEmailsToInvite,
    isSendingInvites,
    handleSendInvites,
    presentParticipants,
    absentParticipantEmails,
    user,
    isListening,
    isRoomCreator,
    handleMuteToggle,
    handlePromoteToEmcee,
    handleDemoteEmcee,
    handleRemoveParticipant,
    handleManualExit,
    handleEndMeeting,
    sessionTimer,
    timerTooltipContent
}: any) {
    
    return (
        <div className="flex flex-col h-full bg-background">
            <header className="p-4 border-b space-y-2">
                <div className="bg-primary/10 p-3 rounded-lg flex justify-between items-center">
                    <div>
                         <p className="text-sm text-primary/80">Room Creator</p>
                        <p className="font-bold text-lg text-primary flex items-center gap-1.5">
                            <Crown className="h-4 w-4" />
                            {roomData.creatorName}
                        </p>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                 <div className="font-mono text-lg text-primary font-semibold flex items-center gap-2 cursor-help">
                                    <Clock className="h-5 w-5" />
                                    {sessionTimer}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {timerTooltipContent}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
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
                    {presentParticipants.map((p: Participant) => {
                        const isCurrentUser = p.uid === user?.uid;
                        const isEmcee = roomData?.emceeEmails?.includes(p.email);
                        const isCreator = isRoomCreator(p.uid);
                        const canBeModified = isCurrentUserEmcee && !isCreator && !isCurrentUser;
                         const canBeDemoted = isCurrentUserEmcee && !isCreator && isEmcee;

                        return (
                            <div key={p.uid} className="flex items-center gap-3 group p-2 rounded-md hover:bg-muted/50">
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
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMuteToggle(p.uid, !!p.isMuted)}>
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
                                                        Remove &amp; Block
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
                        {absentParticipantEmails.map((email: string) => (
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
             <footer className="p-4 border-t flex flex-col gap-4">
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button variant="outline" size="sm" className="w-full">
                                <LogOut className="mr-2 h-4 w-4"/>
                                Exit Room
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure you want to exit?</AlertDialogTitle>
                                <AlertDialogDescription>
                                You can rejoin this room later as long as it is still active.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Stay</AlertDialogCancel>
                                <AlertDialogAction onClick={handleManualExit}>Exit</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {isCurrentUserEmcee && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="w-full">
                                    <ShieldX className="mr-2 h-4 w-4"/>
                                    End Meeting
                                </Button>
                            </DialogTrigger>
                             <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>End Meeting for All?</DialogTitle>
                                    <DialogDescription>
                                        Choose how you would like to end this meeting for all participants.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="sm:justify-end gap-2 pt-4">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DialogClose asChild>
                                                    <Button type="button" variant="ghost">Cancel</Button>
                                                </DialogClose>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Return to the room.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button type="button" variant="destructive" onClick={handleEndMeeting}>
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    End &amp; Delete
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>End the meeting and close the room permanently.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </footer>
        </div>
    );
}

export default function SyncRoomPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const roomId = params.roomId as string;
    const { userProfile, settings, handleSyncOnlineSessionEnd } = useUserData();

    const [user, authLoading] = useAuthState(auth);
    
    const [roomData, roomLoading, roomError] = useDocumentData(doc(db, 'syncRooms', roomId));
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [participantsLoading, setParticipantsLoading] = useState(true);

    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
    
    const [isParticipant, setIsParticipant] = useState<'unknown' | 'yes' | 'no'>('unknown');

    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [emailsToInvite, setEmailsToInvite] = useState('');
    const [isSendingInvites, setIsSendingInvites] = useState(false);
    
    const [isSummarizing, setIsSummarizing] = useState(false);
    
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const processedMessages = useRef(new Set<string>());
    const messageListenerUnsubscribe = useRef<(() => void) | null>(null);
    const joinTimestampRef = useRef<Timestamp | null>(null);
    const isExiting = useRef(false);

    // Timer state lifted up to the parent component
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [sessionTimer, setSessionTimer] = useState('00:00');
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    // Effect to run the clock interval once a session starts
    useEffect(() => {
        if (sessionStartTime !== null) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            
            timerIntervalRef.current = setInterval(() => {
                const elapsedMs = Date.now() - sessionStartTime;
                const totalSeconds = Math.floor(elapsedMs / 1000);
                const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const seconds = (totalSeconds % 60).toString().padStart(2, '0');
                setSessionTimer(`${minutes}:${seconds}`);
            }, 1000);
        }

        // Cleanup timer on component unmount
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        };
    }, [sessionStartTime]);

    const handleExitRoom = useCallback(() => {
        if (isExiting.current) {
            return;
        }
        isExiting.current = true;
        console.log("[DEBUG] handleExitRoom called.");

        if (messageListenerUnsubscribe.current) {
            console.log("[DEBUG] Unsubscribing from message listener.");
            messageListenerUnsubscribe.current();
            messageListenerUnsubscribe.current = null;
        }

        if (user) {
            console.log("[DEBUG] Deleting participant doc for user:", user.uid);
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            deleteDoc(participantRef).then(() => {
                console.log("[DEBUG] Participant doc deleted successfully.");
                const sessionDurationMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
                if (sessionDurationMs > 0) {
                     console.log("[DEBUG] Ending session with duration:", sessionDurationMs);
                    handleSyncOnlineSessionEnd(sessionDurationMs);
                }
            }).catch(error => {
                console.error("[DEBUG] handleExitRoom: Error deleting participant doc:", error);
            });
        }
    }, [user, roomId, handleSyncOnlineSessionEnd, sessionStartTime]);

    const handleManualExit = () => {
        console.log("[DEBUG] handleManualExit called. Navigating away first.");
        router.push('/synchub?tab=sync-online');
    };
    
    // This effect now correctly handles the cleanup *after* navigation.
    // It's triggered when the component unmounts.
    useEffect(() => {
        return () => {
            handleExitRoom();
        };
    }, [handleExitRoom]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    const { presentParticipants, absentParticipantEmails } = useMemo(() => {
        if (!roomData || !participants) {
            return { presentParticipants: [], absentParticipantEmails: [] };
        }
        const presentUids = new Set(participants.map(p => p.uid));
        const absent = roomData.invitedEmails.filter((email: string) => {
             return !participants.some(p => p.email === email);
        });
        
        return { presentParticipants: participants, absentParticipantEmails: absent };

    }, [roomData, participants]);

    const currentUserParticipant = useMemo(() => {
        if (!user || !participants) return undefined;
        return participants.find(p => p.uid === user.uid);
    }, [participants, user]);

    const isCurrentUserEmcee = useMemo(() => {
        if (!user || !roomData) return false;
        return roomData.creatorUid === user.uid || (user.email && roomData.emceeEmails?.includes(user.email));
    }, [user, roomData]);
    
    const freeMinutesRemaining = useMemo(() => {
        if (!settings || !userProfile) return 0;
        
        let lastResetDate: Date;
        const lastResetValue = userProfile.syncOnlineUsageLastReset;

        if (lastResetValue instanceof Timestamp) {
            lastResetDate = lastResetValue.toDate();
        } else if (lastResetValue && typeof lastResetValue === 'object' && 'seconds' in lastResetValue) {
            lastResetDate = new Timestamp((lastResetValue as any).seconds, (lastResetValue as any).nanoseconds).toDate();
        } else {
            lastResetDate = new Date(0);
        }
        
        const now = new Date();
        let currentUsageMs = userProfile.syncOnlineUsage || 0;
    
        if (lastResetDate.getMonth() !== now.getMonth() || lastResetDate.getFullYear() !== now.getFullYear()) {
            currentUsageMs = 0;
        }
        
        const freeMinutesMs = (settings.freeSyncOnlineMinutes || 0) * 60 * 1000;
        const remainingFreeMs = Math.max(0, freeMinutesMs - currentUsageMs);
        
        return Math.floor(remainingFreeMs / 60000);
    }, [settings, userProfile]);

    const timerTooltipContent = useMemo(() => {
        return (
            <div className="p-2 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Free Time Left:</span>
                    <span className="font-bold">{freeMinutesRemaining} min</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Token Balance:</span>
                    <span className="font-bold">{userProfile?.tokenBalance ?? 0}</span>
                </div>
                 <p className="text-xs text-muted-foreground pt-2 border-t">
                    Usage is billed per minute. After free time is used, tokens will be deducted from your balance.
                </p>
            </div>
        );
    }, [freeMinutesRemaining, userProfile?.tokenBalance]);
    
    const isRoomCreator = useCallback((uid: string) => {
        return uid === roomData?.creatorUid;
    }, [roomData]);
    
    
    const setupMessageListener = useCallback((joinTimestamp: Timestamp) => {
        const messagesQuery = query(
            collection(db, 'syncRooms', roomId, 'messages'),
            orderBy("createdAt"),
            where("createdAt", ">=", joinTimestamp)
        );

        return onSnapshot(messagesQuery, (snapshot) => {
            const newMessages: RoomMessage[] = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    newMessages.push({ id: change.doc.id, ...change.doc.data() } as RoomMessage);
                }
            });

            if (newMessages.length > 0) {
                setMessages(prevMessages => [...prevMessages, ...newMessages].sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()));
            }
            setMessagesLoading(false);
        }, (error) => {
            setMessagesLoading(false);
            if (error.code === 'permission-denied') {
                toast({ variant: 'destructive', title: 'Permissions Error', description: 'Could not fetch messages. This might be a temporary issue. Please try re-joining the room.' });
            } else {
                toast({ variant: 'destructive', title: 'Message Error', description: 'Could not fetch new messages.' });
            }
        });
    }, [roomId, toast]);

    const onJoinSuccess = useCallback((joinTime: Timestamp) => {
        if (messageListenerUnsubscribe.current) {
            return;
        }
        joinTimestampRef.current = joinTime;
        setIsParticipant('yes');
        messageListenerUnsubscribe.current = setupMessageListener(joinTime);
    }, [setupMessageListener]);
    

    useEffect(() => {
        if (!user || roomLoading) return;
        
        const participantsQuery = query(collection(db, 'syncRooms', roomId, 'participants'));
        const unsubscribe = onSnapshot(participantsQuery, (snapshot) => {
            const parts = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as Participant);
            setParticipants(parts);
            setParticipantsLoading(false);
            
            if (isParticipant === 'unknown') {
                const self = parts.find(p => p.uid === user.uid);
                if (self && self.joinedAt) {
                    onJoinSuccess(self.joinedAt);
                } else if (!self) {
                     setIsParticipant('no');
                }
            }
        }, (error) => {
            setParticipantsLoading(false);
        });

        return () => unsubscribe();
    }, [user, roomId, roomLoading, onJoinSuccess, isParticipant]);
    
    
    useEffect(() => {
        if (participantsLoading || !user) return; 
    
        const isStillParticipant = participants.some(p => p.uid === user.uid);
        
        if (isParticipant === 'yes' && !isStillParticipant) {
             toast({
                variant: 'destructive',
                title: 'You were removed',
                description: 'An emcee has removed you from the room.',
                duration: 5000,
            });
            handleManualExit();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participants, isParticipant, participantsLoading, user, toast]);

    useEffect(() => {
        if (!roomData || !user || isExiting.current) return;
        if (roomData.status === 'closed') {
            toast({
                title: 'Meeting Ended',
                description: 'This room has been closed by the emcee.',
                duration: 5000,
            });
            handleManualExit();
        }
        if (roomData.blockedUsers?.some((bu: BlockedUser) => bu.uid === user.uid)) {
            toast({
                variant: 'destructive',
                title: 'Access Denied',
                description: 'You have been blocked from this room.',
                duration: 5000
            });
            handleManualExit();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomData, user]);

    useEffect(() => {
        if (!messages.length || !user || !currentUserParticipant?.selectedLanguage) return;

        const processMessage = async (msg: RoomMessage) => {
            if (msg.speakerUid === user.uid || processedMessages.current.has(msg.id)) {
                return;
            }
            processedMessages.current.add(msg.id);
            
            try {
                setIsSpeaking(true);
                
                const fromLangLabel = getAzureLanguageLabel(msg.speakerLanguage);
                const toLangLabel = getAzureLanguageLabel(currentUserParticipant.selectedLanguage!);
                
                const translated = await translateText({
                    text: msg.text,
                    fromLanguage: fromLangLabel,
                    toLanguage: toLangLabel,
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
        }
    }, [user, authLoading, router]);
    

    const handleEndMeeting = async () => {
        if (!isCurrentUserEmcee) {
             return;
        }
        try {
            
            const result = await softDeleteRoom(roomId);
            if (result.success) {
                handleManualExit();
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not end the meeting.' });
            }
        } catch (error) {
            console.error("Error ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not end the meeting.' });
        }
    };
    
    const handleSaveAndEndMeeting = async () => {
        if (!isCurrentUserEmcee) return;
        setIsSummarizing(true);
        toast({ title: 'Summarizing...', description: 'The AI is generating a meeting summary. This may take a moment.' });
        try {
            await summarizeRoom({ roomId });
            toast({ title: 'Summary Saved!', description: 'The meeting has ended and the summary is available.' });
            handleManualExit();
        } catch (error) {
            console.error("Error saving and ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save the summary and end the meeting.' });
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleSendInvites = async () => {
        if (!user || !roomData) return;
        const emails = emailsToInvite.split(/[ ,]+/).map(e => e.trim()).filter(Boolean);
        if (emails.length === 0) {
            toast({ variant: 'destructive', title: 'No Emails', description: 'Please enter at least one email address.' });
            return;
        }

        setIsSendingInvites(true);
        try {
            await updateDoc(doc(db, 'syncRooms', roomId), {
                invitedEmails: arrayUnion(...emails)
            });
            
            const scheduledAtDate = roomData.scheduledAt
                ? (roomData.scheduledAt instanceof Timestamp ? roomData.scheduledAt.toDate() : new Date(roomData.scheduledAt))
                : new Date();

            await sendRoomInviteEmail({
                to: emails,
                roomTopic: roomData.topic,
                creatorName: user.displayName || 'A user',
                scheduledAt: scheduledAtDate,
                joinUrl: `${window.location.origin}/join/${roomId}?ref=${roomData.creatorUid}`
            });

            toast({ title: 'Invites Sent', description: 'The new participants have been notified by email.' });
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

        // Start the timer on the first mic press
        if (sessionStartTime === null) {
            setSessionStartTime(Date.now());
        }

        setIsListening(true);
        try {
            const recognizedText = await recognizeFromMic(currentUserParticipant.selectedLanguage);
            
            if (recognizedText) {
                 const batch = writeBatch(db);
                 const roomRef = doc(db, 'syncRooms', roomId);

                if (!roomData?.firstMessageAt) {
                    batch.update(roomRef, { firstMessageAt: serverTimestamp() });
                }

                const messageRef = doc(collection(db, 'syncRooms', roomId, 'messages'));
                 batch.set(messageRef, {
                    text: recognizedText,
                    speakerName: currentUserParticipant.name,
                    speakerUid: currentUserParticipant.uid,
                    speakerLanguage: currentUserParticipant.selectedLanguage,
                    createdAt: serverTimestamp(),
                });

                await batch.commit();
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

            batch.update(doc(db, 'syncRooms', roomId), {
                blockedUsers: arrayUnion(userToBlock)
            });

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
            await updateDoc(doc(db, 'syncRooms', roomId), {
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
            await updateDoc(doc(db, 'syncRooms', roomId), {
                emceeEmails: arrayRemove(participantEmail)
            });
            toast({ title: 'Demotion Success', description: `${participantEmail} is no longer an emcee.` });
        } catch (error) {
            console.error("Error demoting emcee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not demote emcee.' });
        }
    };

    if (authLoading || roomLoading || participantsLoading || isParticipant === 'unknown' || isSummarizing) {
        return <div className="flex h-screen items-center justify-center flex-col gap-4">
            <LoaderCircle className="h-10 w-10 animate-spin" />
            {isSummarizing && <p className="text-lg text-muted-foreground">AI is summarizing, please wait...</p>}
            </div>;
    }

    if (roomError) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load room data.' });
        router.push('/synchub?tab=sync-online');
        return null;
    }

    if (!roomData) {
        return <div className="flex h-screen items-center justify-center"><p>Room not found.</p></div>;
    }
    
    if (user && isParticipant === 'no') {
        return <SetupScreen user={user} room={roomData as SyncRoom} roomId={roomId} onJoinSuccess={onJoinSuccess} />;
    }

    const participantsPanelProps = {
        roomData,
        isCurrentUserEmcee,
        isInviteDialogOpen,
        setIsInviteDialogOpen,
        emailsToInvite,
        setEmailsToInvite,
        isSendingInvites,
        handleSendInvites,
        presentParticipants,
        absentParticipantEmails,
        user,
        isListening,
        isRoomCreator,
        handleMuteToggle,
        handlePromoteToEmcee,
        handleDemoteEmcee,
        handleRemoveParticipant,
        handleManualExit,
        handleEndMeeting,
        sessionTimer,
        timerTooltipContent
    };

    return (
        <div className="flex h-screen bg-muted/40">
            <aside className="hidden md:flex md:w-1/3 min-w-[320px] max-w-sm border-r">
                <ParticipantsPanel {...participantsPanelProps} />
            </aside>

            <main className="flex-1 flex flex-col">
                 <header className="p-4 border-b bg-background flex justify-between items-center gap-4">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="icon" className="md:hidden">
                                <Users className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-80">
                           <SheetHeader className="sr-only"><SheetTitle>Participants Panel</SheetTitle><SheetDescription>View and manage room participants.</SheetDescription></SheetHeader>
                            <ParticipantsPanel {...participantsPanelProps} />
                        </SheetContent>
                    </Sheet>

                    <div className="flex-grow text-center">
                        <h1 className="text-xl font-semibold">{roomData.topic}</h1>
                    </div>
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden">
                                <LogOut />
                                <span className="sr-only">Exit</span>
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to exit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You can rejoin this room later as long as it is still active.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Stay</AlertDialogCancel>
                            <AlertDialogAction onClick={handleManualExit}>Exit</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </header>

                <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
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
                         {messagesLoading && currentUserParticipant && <LoaderCircle className="mx-auto my-4 h-6 w-6 animate-spin" />}
                         {!messagesLoading && messages?.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <p>No messages yet. Be the first to speak!</p>
                            </div>
                         )}
                    </ScrollArea>
                </div>
                <div className="p-4 border-t bg-background flex flex-col gap-4">
                    <div className="flex flex-col items-center justify-center gap-4">
                       <Button 
                            size="lg" 
                            className={cn("rounded-full w-24 h-24 text-lg", isListening && "bg-destructive hover:bg-destructive/90")}
                            onClick={isListening ? abortRecognition : handleMicPress}
                            disabled={isSpeaking || currentUserParticipant?.isMuted}
                            title={currentUserParticipant?.isMuted ? 'You are muted' : 'Press to talk'}
                        >
                            {currentUserParticipant?.isMuted ? <MicOff className="h-10 w-10"/> : (isListening ? <XCircle className="h-10 w-10"/> : <Mic className="h-10 w-10"/>)}
                        </Button>
                        <p className="font-semibold text-muted-foreground text-sm h-5 w-48 text-center">
                            {currentUserParticipant?.isMuted ? "You are muted by an emcee." : (isListening ? "Listening..." : (isSpeaking ? "Playing incoming audio..." : "Press the mic to talk"))}
                        </p>
                    </div>
                </div>
                 <audio ref={audioPlayerRef} className="hidden" />
            </main>
        </div>
    );
}
