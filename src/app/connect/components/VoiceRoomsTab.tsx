
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, ShieldCheck, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw, Calendar as CalendarIcon, Users, Link as LinkIcon, Send, HelpCircle, XCircle } from 'lucide-react';
import type { SyncRoom, UserProfile } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { requestSummaryEditAccess, updateScheduledRoom, endAndReconcileRoom, permanentlyDeleteRooms, setRoomEditability, updateRoomSummary } from '@/actions/room';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { languages } from '@/lib/data';
import { translateSummary } from '@/ai/flows/translate-summary-flow';
import { useUserData } from '@/context/UserDataContext';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import BuyTokens from '@/components/BuyTokens';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { sendRoomInviteEmail } from '@/actions/email';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, writeBatch, doc, serverTimestamp, increment } from 'firebase/firestore';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { useTour, TourStep } from '@/context/TourContext';


function RoomSummaryDialog({ room, onUpdate }: { room: ClientSyncRoom; onUpdate: () => void }) {
     const { userProfile, user, settings } = useUserData();
    const { toast, dismiss } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editableSummary, setEditableSummary] = useState(room.summary);
    const [isSaving, setIsSaving] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

    useEffect(() => {
        setEditableSummary(room.summary);
    }, [room.summary]);

    const isEmcee = useMemo(() => {
        if (!user || !room) return false;
        return room.creatorUid === user.uid || (user.email && room.emceeEmails?.includes(user.email));
    }, [user, room]);
    
    const canEditSummary = isEmcee || room.summary?.allowMoreEdits;

     const formatDate = (dateString?: string) => {
        if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateString)) return "Unknown Date";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Invalid Date";
            return new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC' // Important to avoid off-by-one day errors
            }).format(date);
        } catch (e) {
            console.error("Error formatting date:", e);
            return "Invalid Date";
        }
    }
    
    if (!editableSummary) return null;


    return (
        <Dialog>
            <DialogTrigger asChild>
                 <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    View Summary
                 </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>{editableSummary.title}</DialogTitle>
                    <DialogDescription>
                        Meeting held on {formatDate(editableSummary.date)}
                    </DialogDescription>
                </DialogHeader>
                {/* Full dialog content would go here, it's omitted for brevity */}
            </DialogContent>
        </Dialog>
    )
}

function ManageRoomDialog({ room, onUpdate }: { room: ClientSyncRoom; onUpdate: () => void }) {
     const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const handlePermanentDelete = async () => {
        setIsActionLoading(true);
        const result = await permanentlyDeleteRooms([room.id]);
        if (result.success) {
            toast({ title: 'Room Deleted', description: 'The room has been permanently deleted.' });
            onUpdate();
            setIsOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete room.' });
        }
        setIsActionLoading(false);
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Manage Room: {room.topic}</DialogTitle>
                </DialogHeader>
                 <div className="py-4 space-y-4">
                    <p className="text-sm text-muted-foreground">This room is scheduled. You can cancel and delete it, which will notify participants.</p>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isActionLoading}>
                                {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                Cancel and Delete Room
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Go Back</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePermanentDelete}>Confirm Cancellation</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </DialogContent>
        </Dialog>
    )
}


export default function VoiceRoomsTab() {
    const { user, userProfile, loading } = useUserData();
    const router = useRouter();
    const { toast } = useToast();
    const { startTour } = useTour();
    
    const [activeMainTab, setActiveMainTab] = useState('your-rooms');

    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form State
    const [roomTopic, setRoomTopic] = useState('');
    const [creatorLanguage, setCreatorLanguage] = useState<AzureLanguageCode | ''>(userProfile?.defaultLanguage || '');
    const [inviteeEmails, setInviteeEmails] = useState('');
    const [emceeEmails, setEmceeEmails] = useState<string[]>([]);
    const [duration, setDuration] = useState(30);
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
    const [startNow, setStartNow] = useState(false);
    const [friends, setFriends] = useState<UserProfile[]>([]);

    
    // Edit Mode State
    const [editingRoom, setEditingRoom] = useState<ClientSyncRoom | null>(null);
    const isEditMode = useMemo(() => !!editingRoom, [editingRoom]);

    const [invitedRooms, setInvitedRooms] = useState<ClientSyncRoom[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(true);
    const [activeRoomTab, setActiveRoomTab] = useState('active');
    
    const { settings } = useUserData();
    
    const fetchFriends = useCallback(async () => {
        if (userProfile?.friends && userProfile.friends.length > 0) {
            const friendsQuery = query(collection(db, 'users'), where('__name__', 'in', userProfile.friends));
            const snapshot = await getDocs(friendsQuery);
            const friendsDetails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setFriends(friendsDetails);
        } else {
            setFriends([]);
        }
    }, [userProfile?.friends]);

    useEffect(() => {
        if (activeMainTab === 'schedule') {
            fetchFriends();
        }
    }, [activeMainTab, fetchFriends]);

    useEffect(() => {
        if (activeMainTab !== 'schedule') return;
        if (!isEditMode) {
             const defaultDate = new Date();
            defaultDate.setMinutes(defaultDate.getMinutes() + 30);
            defaultDate.setSeconds(0);
            defaultDate.setMilliseconds(0);
            setScheduledDate(defaultDate);
        } else if (editingRoom?.scheduledAt) {
            const scheduled = editingRoom.scheduledAt;
            if (scheduled && typeof scheduled === 'string') {
                setScheduledDate(new Date(scheduled));
            }
        }
    }, [activeMainTab, isEditMode, editingRoom]);


     const resetForm = useCallback(() => {
        const defaultDate = new Date();
        defaultDate.setMinutes(defaultDate.getMinutes() + 30);
        defaultDate.setSeconds(0);
        defaultDate.setMilliseconds(0);
        
        setRoomTopic('');
        setCreatorLanguage(userProfile?.defaultLanguage || '');
        setInviteeEmails('');
        setEmceeEmails(user?.email ? [user.email] : []);
        setDuration(30);
        setScheduledDate(defaultDate);
        setStartNow(false);
        setEditingRoom(null);
    }, [user?.email, userProfile?.defaultLanguage]);

     useEffect(() => {
        if (activeMainTab === 'schedule' && !isEditMode) {
             resetForm();
        }
    }, [activeMainTab, isEditMode, resetForm]);
    
     useEffect(() => {
        if (userProfile?.defaultLanguage && !creatorLanguage) {
            setCreatorLanguage(userProfile.defaultLanguage);
        }
    }, [userProfile?.defaultLanguage, creatorLanguage]);

     useEffect(() => {
        if (isEditMode && editingRoom) {
            setRoomTopic(editingRoom.topic);
            setInviteeEmails(editingRoom.invitedEmails.filter(e => e !== user?.email).join(', '));
            setEmceeEmails(editingRoom.emceeEmails);
            setDuration(editingRoom.durationMinutes || 30);
            setStartNow(false); // "Start Now" is not applicable for editing
            
            const scheduled = editingRoom.scheduledAt;
            if (scheduled && typeof scheduled === 'string' && !isNaN(new Date(scheduled).getTime())) {
                setScheduledDate(new Date(scheduled));
            } else {
                 setScheduledDate(new Date());
            }
        }
    }, [editingRoom, isEditMode, user?.email]);


    const parsedInviteeEmails = useMemo(() => {
        return inviteeEmails.split(/[ ,]+/).map(email => email.trim()).filter(Boolean);
    }, [inviteeEmails]);

    const allInvitedEmailsForCalc = useMemo(() => {
        return [...new Set([user?.email, ...parsedInviteeEmails].filter(Boolean) as string[])];
    }, [parsedInviteeEmails, user?.email]);

    const calculatedCost = useMemo(() => {
        if (!settings || !userProfile) return 0;
        const freeMinutesMs = (settings.freeSyncOnlineMinutes || 0) * 60 * 1000;
        const currentUsageMs = userProfile.syncOnlineUsage || 0;
        const remainingFreeMs = Math.max(0, freeMinutesMs - currentUsageMs);
        const remainingFreeMinutes = Math.floor(remainingFreeMs / 60000);
        
        const billableMinutes = Math.max(0, duration - remainingFreeMinutes);
        
        return billableMinutes * (settings.costPerSyncOnlineMinute || 1) * allInvitedEmailsForCalc.length;
    }, [settings, duration, allInvitedEmailsForCalc.length, userProfile]);

    const costDifference = useMemo(() => {
        if (!isEditMode || !editingRoom) return 0;
        return calculatedCost - (editingRoom.initialCost || 0);
    }, [isEditMode, editingRoom, calculatedCost]);
    
     const toggleEmcee = (email: string) => {
        setEmceeEmails(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
    };

    const fetchInvitedRooms = useCallback(async () => {
        if (!user || !user.email) {
            setInvitedRooms([]);
            setIsFetchingRooms(false);
            return;
        }
        setIsFetchingRooms(true);
        try {
            const roomsData = await getAllRooms();
            const userRooms = roomsData.filter(room => room.invitedEmails.includes(user.email!))
                .sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
            setInvitedRooms(userRooms);
        } catch (error: any) {
            console.error("Error fetching invited rooms:", error);
            toast({ variant: 'destructive', title: 'Could not fetch rooms' });
        } finally {
            setIsFetchingRooms(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (user) {
            fetchInvitedRooms();
        } else if (!loading) {
             setIsFetchingRooms(false);
             setInvitedRooms([]);
        }
    }, [user, loading, fetchInvitedRooms]);
    
    const handleOpenEditDialog = (room: ClientSyncRoom) => {
        setEditingRoom(room);
        setActiveMainTab('schedule');
    };
    
    const handleSubmitRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !userProfile || !settings) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create or edit a room.' });
            return;
        }
        
        const requiredFields = (isEditMode || startNow) ? [roomTopic] : [roomTopic, creatorLanguage, scheduledDate];
        if (requiredFields.some(f => !f)) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all required fields.' });
            return;
        }

        const allInvitedEmails = [...new Set([...parsedInviteeEmails, user.email])];

        if (settings && allInvitedEmails.length > settings.maxUsersPerRoom) {
            toast({
                variant: 'destructive',
                title: 'Participant Limit Exceeded',
                description: `You can invite a maximum of ${settings.maxUsersPerRoom - 1} other participants (total ${settings.maxUsersPerRoom}).`,
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const finalScheduledDate = startNow ? new Date() : scheduledDate!;
            
            if (isEditMode && editingRoom) {
                 if ((userProfile.tokenBalance || 0) + (editingRoom.initialCost || 0) < calculatedCost) {
                    toast({ variant: "destructive", title: "Insufficient Tokens", description: `You need ${calculatedCost - ((userProfile.tokenBalance || 0) + (editingRoom.initialCost || 0))} more tokens.` });
                    setIsSubmitting(false);
                    return;
                }
                const result = await updateScheduledRoom({
                    roomId: editingRoom.id,
                    userId: user.uid,
                    updates: {
                        topic: roomTopic,
                        scheduledAt: finalScheduledDate.toISOString(),
                        durationMinutes: duration,
                        invitedEmails: allInvitedEmails,
                        emceeEmails: [...new Set(emceeEmails)],
                    },
                    newCost: calculatedCost
                });
                if(result.success) {
                    toast({ title: "Room Updated!", description: "Your changes have been saved." });
                } else {
                     toast({ variant: "destructive", title: "Update Failed", description: result.error });
                }
            } else {
                 if ((userProfile.tokenBalance || 0) < calculatedCost) {
                    toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${calculatedCost} tokens to schedule this meeting.`});
                    setIsSubmitting(false);
                    return;
                }
                const newRoomRef = doc(collection(db, 'syncRooms'));
                const batch = writeBatch(db);
                const userDocRef = doc(db, 'users', user.uid);
                
                const newRoom: Omit<SyncRoom, 'id'> = {
                    topic: roomTopic,
                    creatorUid: user.uid,
                    creatorName: user.displayName || user.email?.split('@')[0] || 'Creator',
                    createdAt: serverTimestamp(),
                    status: startNow ? 'active' : 'scheduled',
                    invitedEmails: allInvitedEmails,
                    emceeEmails: [...new Set(emceeEmails)],
                    blockedUsers: [],
                    lastActivityAt: serverTimestamp(),
                    scheduledAt: Timestamp.fromDate(finalScheduledDate),
                    durationMinutes: duration,
                    initialCost: calculatedCost,
                    hasStarted: startNow,
                    reminderMinutes: settings.roomReminderMinutes,
                };
                batch.set(newRoomRef, newRoom);
                
                if (calculatedCost > 0) {
                    batch.update(userDocRef, { tokenBalance: increment(-calculatedCost) });
                    const logRef = doc(collection(userDocRef, 'transactionLogs'));
                    batch.set(logRef, {
                        actionType: 'live_sync_online_spend',
                        tokenChange: -calculatedCost,
                        timestamp: serverTimestamp(),
                        description: `Pre-paid for room: "${roomTopic}"`
                    });
                }
                
                const freeMinutesToDeduct = Math.min(duration, Math.floor(Math.max(0, (settings?.freeSyncOnlineMinutes || 0) * 60 * 1000 - (userProfile.syncOnlineUsage || 0)) / 60000));
                if(freeMinutesToDeduct > 0) {
                     batch.update(userDocRef, { syncOnlineUsage: increment(freeMinutesToDeduct * 60000) });
                }
                
                await batch.commit();

                // Send email invites, which will also handle in-app notifications on the server
                if (parsedInviteeEmails.length > 0) {
                    await sendRoomInviteEmail({
                        to: parsedInviteeEmails,
                        roomTopic: roomTopic,
                        fromName: user.displayName || 'A user',
                        roomId: newRoomRef.id,
                        scheduledAt: finalScheduledDate,
                        joinUrl: `${window.location.origin}/join/${newRoomRef.id}?ref=${user.uid}`
                    });
                }
                
                toast({ title: "Room Scheduled!", description: "Your meeting is ready." });
                
                if (startNow) {
                    router.push(`/sync-room/${newRoomRef.id}`);
                }
            }
            
            fetchInvitedRooms();
            setActiveMainTab('your-rooms');

        } catch (error) {
            console.error("Error submitting room:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not submit the room." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const { active, scheduled, closed } = useMemo(() => {
        return invitedRooms.reduce((acc, room) => {
            if (room.status === 'active') {
                acc.active.push(room);
            } else if (room.status === 'scheduled') {
                acc.scheduled.push(room);
            } else if (room.status === 'closed' && room.summary) {
                acc.closed.push(room);
            }
            return acc;
        }, { active: [] as ClientSyncRoom[], scheduled: [] as ClientSyncRoom[], closed: [] as ClientSyncRoom[] });
    }, [invitedRooms]);

    const canJoinRoom = (room: ClientSyncRoom) => {
        const scheduledAt = room.scheduledAt;
        if (!scheduledAt) return true; 

        const scheduledTime = new Date(scheduledAt).getTime();
        const now = Date.now();
        const gracePeriod = 5 * 60 * 1000; // 5 minutes
        return now >= scheduledTime - gracePeriod;
    };

    const copyInviteLink = (roomId: string, creatorId: string) => {
        const link = `${window.location.origin}/join/${roomId}?ref=${creatorId}`;
        navigator.clipboard.writeText(link);
        toast({ title: 'Invite Link Copied!', description: 'You can now share this link with anyone.' });
    };

    const toggleFriendInvite = (friend: UserProfile) => {
        if (!friend.email) return;
        const currentEmails = new Set(parsedInviteeEmails);
        if (currentEmails.has(friend.email)) {
            currentEmails.delete(friend.email);
        } else {
            currentEmails.add(friend.email);
        }
        setInviteeEmails(Array.from(currentEmails).join(', '));
    };


    const renderRoomList = (rooms: ClientSyncRoom[], roomType: 'active' | 'scheduled' | 'closed') => (
         <div className="space-y-4">
            {rooms.length > 0 ? (
                <ul className="space-y-3">
                    {rooms.map((room, index) => {
                        const isBlocked = room.blockedUsers?.some(bu => bu.uid === user!.uid);
                        const isCreator = room.creatorUid === user!.uid;
                        const canJoin = room.status === 'active' || (room.status === 'scheduled' && canJoinRoom(room));
                        const tourProps = roomType === 'active' && index === 0 
                            ? {
                                start: {'data-tour': `so-start-room-${index}`},
                                share: {'data-tour': `so-share-link-${index}`},
                                settings: {'data-tour': `so-settings-${index}`}
                            }
                            : {start: {}, share: {}, settings: {}};

                        return (
                            <li key={room.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg gap-2">
                                <div className="flex-grow">
                                    <p className="font-semibold">{room.topic}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm text-muted-foreground">
                                            {room.status === 'scheduled' && room.scheduledAt 
                                                ? format(new Date(room.scheduledAt), 'PPpp')
                                                : `Created: ${room.createdAt ? format(new Date(room.createdAt), 'PPp') : '...'}`
                                            }
                                        </p>
                                        {room.status === 'closed' && (
                                            <Badge variant={room.summary ? 'default' : 'destructive'}>
                                                {room.summary ? 'Summary Available' : 'Closed'}
                                            </Badge>
                                        )}
                                        {room.status === 'scheduled' && (
                                             <Badge variant="outline">{room.durationMinutes} min</Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isBlocked && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <XCircle className="h-5 w-5 text-destructive" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>You are blocked from this room.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}

                                    {canJoin && !isCreator && (
                                        <Button asChild disabled={isBlocked}>
                                            <Link href={`/sync-room/${room.id}`}>Join Room</Link>
                                        </Button>
                                    )}

                                    {isCreator && canJoin && (
                                        <Button asChild disabled={isBlocked} {...tourProps.start}>
                                            <Link href={`/sync-room/${room.id}`}>Start Room</Link>
                                        </Button>
                                    )}
                                    
                                    {isCreator && (room.status === 'scheduled' || room.status === 'active') && (
                                        <Button variant="outline" size="icon" onClick={() => copyInviteLink(room.id, room.creatorUid)} {...tourProps.share}><LinkIcon className="h-4 w-4"/></Button>
                                    )}

                                    {isCreator && room.status === 'scheduled' && (
                                        <Button variant="outline" size="icon" onClick={() => handleOpenEditDialog(room)}><Edit className="h-4 w-4"/></Button>
                                    )}

                                    {room.summary && (
                                        <RoomSummaryDialog room={room} onUpdate={fetchInvitedRooms} />
                                    )}
                                    
                                    {isCreator && (
                                        <div {...tourProps.settings}>
                                            <ManageRoomDialog room={room} onUpdate={fetchInvitedRooms} />
                                        </div>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <p className="text-muted-foreground text-center py-4">No rooms in this category.</p>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>
                        Schedule a private room and invite others for a real-time, multi-language voice conversation.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Button onClick={() => startTour([])} size="lg">
                            <HelpCircle className="mr-2" />
                            Take a Tour
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="your-rooms">Your Voice Rooms</TabsTrigger>
                    <TabsTrigger value="schedule" data-tour="so-schedule-button" onClick={() => resetForm()}>Schedule a Voice Room</TabsTrigger>
                </TabsList>
                <TabsContent value="your-rooms" className="mt-4">
                    {user && (
                        <Card data-tour="so-room-list">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><List /> Room List</CardTitle>
                                <CardDescription>A list of all your active, scheduled, and summarized rooms.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isFetchingRooms ? (
                                    <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="animate-spin h-5 w-5" /><p>Fetching rooms...</p></div>
                                ) : (
                                    <Tabs value={activeRoomTab} onValueChange={setActiveRoomTab} className="w-full">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="scheduled">Scheduled ({scheduled.length})</TabsTrigger>
                                            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
                                            <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="scheduled" className="mt-4">
                                            {renderRoomList(scheduled, 'scheduled')}
                                        </TabsContent>
                                        <TabsContent value="active" className="mt-4">
                                            {renderRoomList(active, 'active')}
                                        </TabsContent>
                                        <TabsContent value="closed" className="mt-4">
                                            {renderRoomList(closed, 'closed')}
                                        </TabsContent>
                                    </Tabs>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
                <TabsContent value="schedule" className="mt-4">
                     <Card className="border-2 border-primary">
                        <CardHeader>
                            <CardTitle>{isEditMode ? 'Edit' : 'Schedule'} a Voice Room</CardTitle>
                            <CardDescription>Set the details for your meeting. The cost will be calculated and displayed below.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="create-room-form" onSubmit={handleSubmitRoom}>
                                <ScrollArea className="max-h-[60vh] p-1">
                                    <div className="space-y-6 pr-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="topic">Room Topic</Label>
                                            <Input id="topic" value={roomTopic} onChange={(e) => setRoomTopic(e.target.value)} placeholder="e.g., Planning our trip to Angkor Wat" required />
                                        </div>
                                        {!isEditMode && (
                                            <div className="space-y-2">
                                                <Label htmlFor="language">Your Spoken Language</Label>
                                                <Select onValueChange={(v) => setCreatorLanguage(v as AzureLanguageCode)} value={creatorLanguage} required>
                                                    <SelectTrigger id="language">
                                                        <SelectValue placeholder="Select language..." />
                                                    </SelectTrigger>
                                                    <SelectContent><ScrollArea className="h-72">{azureLanguages.map(lang => (<SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>))}</ScrollArea></SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        {!isEditMode && (
                                            <div className="flex items-center space-x-2 pt-2">
                                                <Checkbox id="start-now" checked={startNow} onCheckedChange={(checked) => setStartNow(!!checked)} />
                                                <Label htmlFor="start-now">Start meeting immediately</Label>
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="duration">Duration (minutes)</Label>
                                                <Select onValueChange={(v) => setDuration(parseInt(v))} value={String(duration)}>
                                                    <SelectTrigger id="duration"><SelectValue /></SelectTrigger>
                                                    <SelectContent>{[5, 15, 30, 45, 60].map(d => (<SelectItem key={d} value={String(d)}>{d} min</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            {!startNow && (
                                            <div className="space-y-2">
                                                <Label>Date &amp; Time</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn("w-full justify-start text-left font-normal", !scheduledDate && "text-muted-foreground")}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {scheduledDate ? format(scheduledDate, "PPp") : <span>Pick a date</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <ScrollArea className="h-96">
                                                            <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} initialFocus disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1))} />
                                                            <div className="p-3 border-t border-border">
                                                                <div className="flex items-center gap-2">
                                                                    <Select
                                                                        value={scheduledDate ? String(scheduledDate.getHours()).padStart(2, '0') : '00'}
                                                                        onValueChange={(value) => {
                                                                            setScheduledDate(d => {
                                                                                const newDate = d ? new Date(d) : new Date();
                                                                                newDate.setHours(parseInt(value));
                                                                                return newDate;
                                                                            });
                                                                        }}
                                                                    >
                                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                                        <SelectContent position="popper">
                                                                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(hour => (
                                                                                <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    :
                                                                    <Select
                                                                            value={scheduledDate ? String(Math.floor(scheduledDate.getMinutes() / 15) * 15).padStart(2, '0') : '00'}
                                                                        onValueChange={(value) => {
                                                                            setScheduledDate(d => {
                                                                                const newDate = d ? new Date(d) : new Date();
                                                                                newDate.setMinutes(parseInt(value));
                                                                                return newDate;
                                                                            });
                                                                        }}
                                                                    >
                                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                                        <SelectContent position="popper">
                                                                            {['00', '15', '30', '45'].map(minute => (
                                                                                <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                        </ScrollArea>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                                )}
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="invitees">Invite Emails (comma-separated)</Label>
                                            <Textarea id="invitees" value={inviteeEmails} onChange={(e) => setInviteeEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com" />
                                        </div>
                                         {friends.length > 0 && (
                                            <div className="space-y-2">
                                                <Label>Or Select Friends</Label>
                                                <ScrollArea className="max-h-32 border rounded-md">
                                                    <div className="p-4 space-y-2">
                                                        {friends.map(friend => (
                                                            <div key={friend.id} className="flex items-center space-x-2">
                                                                <Checkbox 
                                                                    id={`friend-${friend.id}`}
                                                                    checked={parsedInviteeEmails.includes(friend.email)}
                                                                    onCheckedChange={() => toggleFriendInvite(friend)}
                                                                />
                                                                <Label htmlFor={`friend-${friend.id}`} className="font-normal flex flex-col">
                                                                    <span>{friend.name}</span>
                                                                    <span className="text-xs text-muted-foreground">{friend.email}</span>
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        )}
                                        
                                        <div className="space-y-3">
                                            <Separator/>
                                            <Label className="font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary"/> Participants ({allInvitedEmailsForCalc.length})</Label>
                                            <ScrollArea className="max-h-24"><div className="space-y-1 text-sm text-muted-foreground p-2 border rounded-md">
                                                {allInvitedEmailsForCalc.length > 0 ? (
                                                    allInvitedEmailsForCalc.map(email => (
                                                        <p key={email} className="truncate">{email} {email === user?.email && '(You)'}</p>
                                                    ))
                                                ) : (
                                                    <p>Just you so far!</p>
                                                )}
                                            </div></ScrollArea>
                                        </div>

                                        {allInvitedEmailsForCalc.length > 1 && (
                                            <div className="space-y-3">
                                                <Separator/>
                                                <Label className="font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/> Assign Emcees</Label>
                                                <ScrollArea className="max-h-32"><div className="space-y-2 pr-4">
                                                    {allInvitedEmailsForCalc.map(email => (
                                                        <div key={email} className="flex items-center space-x-2">
                                                            <Checkbox 
                                                                id={email} 
                                                                checked={emceeEmails.includes(email)} 
                                                                onCheckedChange={() => toggleEmcee(email)}
                                                                disabled={email === user?.email}
                                                            />
                                                            <Label htmlFor={email} className="font-normal w-full truncate">
                                                                {email} {email === user?.email && '(Creator)'}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div></ScrollArea>
                                            </div>
                                        )}
                                        <div className="p-3 rounded-lg bg-muted text-sm space-y-2">
                                            {isEditMode ? (
                                                <>
                                                    <div className="flex justify-between"><span>Original Cost:</span> <span>{editingRoom?.initialCost || 0} tokens</span></div>
                                                    <div className="flex justify-between"><span>New Cost:</span> <span>{calculatedCost} tokens</span></div>
                                                    <Separator/>
                                                    <div className="flex justify-between font-bold">
                                                        <span>{costDifference >= 0 ? "Additional Charge:" : "Refund:"}</span>
                                                        <span className={costDifference >= 0 ? 'text-destructive' : 'text-green-600'}>{Math.abs(costDifference)} tokens</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="font-semibold">Total Estimated Cost: <strong className="text-primary">{calculatedCost} tokens</strong></p>
                                            )}
                                            
                                            <p className="text-xs text-muted-foreground">
                                                Based on {allInvitedEmailsForCalc.length} participant(s) for {duration} minutes.
                                            </p>
                                            <p className="text-xs text-muted-foreground">Your Balance: {userProfile?.tokenBalance || 0} tokens</p>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </form>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                             {isEditMode ? (
                                <Button type="button" variant="ghost" onClick={() => setActiveMainTab('your-rooms')}>Cancel Edit</Button>
                            ) : null}
                            {(userProfile?.tokenBalance || 0) < costDifference ? (
                                <div className="flex flex-col items-end gap-2">
                                    <p className="text-destructive text-sm font-semibold">Insufficient tokens.</p>
                                    <BuyTokens />
                                </div>
                            ) : (
                                <Button type="submit" form="create-room-form" disabled={isSubmitting}>
                                    {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {isSubmitting ? (isEditMode ? 'Saving...' : 'Scheduling...') : 
                                        isEditMode ? `Confirm & Pay ${costDifference > 0 ? costDifference : 0} Tokens` : `Confirm & Pay ${calculatedCost} Tokens`
                                    }
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
