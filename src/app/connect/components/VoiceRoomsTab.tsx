

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
  DialogFooter,
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
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, ShieldCheck, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw, Calendar as CalendarIcon, Users, Link as LinkIcon, Send, HelpCircle, Info, Wand2 } from 'lucide-react';
import type { SyncRoom, UserProfile, RoomSummary, TranslatedContent, Transcript } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { requestSummaryEditAccess, updateScheduledRoom, endAndReconcileRoom, permanentlyDeleteRooms, setRoomEditability, updateRoomSummary, summarizeRoomAction, getTranscriptAction } from '@/actions/room';
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
import { useAuthState } from 'react-firebase-hooks/auth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


function VoiceRoomsInfoDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>About Voice Rooms</DialogTitle>
                    <DialogDescription>Voice rooms are for real-time, translated conversations.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4 py-4 text-sm">
                        <div>
                            <h4 className="font-semibold mb-1">Scheduling a Room</h4>
                            <p className="text-muted-foreground">
                                Use the "Schedule a Room" tab to create a new voice chat. You'll need to set a topic, duration, and invite participants via email. You can also start a room immediately.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Pre-Paid System & Token Reconciliation</h4>
                            <p className="text-muted-foreground">
                                Voice rooms are pre-paid based on the number of participants and duration. This amount is deducted from your token balance when you schedule the room. The actual cost is based on usage, so when the room is closed (either by the host or when the last person leaves), the system reconciles the cost. Any unused tokens from your pre-payment will be refunded to your account.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Your Rooms Explained</h4>
                            <p className="text-muted-foreground">The "Your Rooms" tab is split into three sections:</p>
                            <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                                <li><strong>Scheduled:</strong> Rooms that are planned for the future. You can join a few minutes before the start time.</li>
                                <li><strong>Active:</strong> Rooms that are currently in progress.</li>
                                <li><strong>Closed:</strong> Rooms that have ended. From here, you can view the AI-generated meeting summary.</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">AI Summaries & Transcripts</h4>
                             <p className="text-muted-foreground">
                                After a meeting ends, an AI agent generates a summary of the conversation. This costs tokens to generate initially but can be viewed and translated by anyone in the room for free afterwards. You can also generate a full, plain-text transcript of the entire meeting for a token fee.
                            </p>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button>Got it!</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function RoomSummaryDialog({ room, onUpdate }: { room: ClientSyncRoom; onUpdate: () => void }) {
    const { userProfile, user, settings } = useUserData();
    const { toast, dismiss } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editableSummary, setEditableSummary] = useState(room.summary);
    const [isSaving, setIsSaving] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [isDownloadingTranscript, setIsDownloadingTranscript] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('');


    useEffect(() => {
        setEditableSummary(room.summary);
    }, [room.summary]);

    const isEmcee = useMemo(() => {
        if (!user || !room) return false;
        return room.creatorUid === user.uid || (user.email && room.emceeEmails?.includes(user.email));
    }, [user, room]);
    
    const canEditSummary = isEmcee || room.summary?.allowMoreEdits;

     const formatDate = (dateString?: string) => {
        if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}/.test(dateString)) return "Unknown Date";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Invalid Date";
            // Ensure we parse as UTC and display as such to prevent timezone shift issues
            const utcDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
            return new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC'
            }).format(utcDate);
        } catch (e) {
            console.error("Error formatting date:", e);
            return "Invalid Date";
        }
    }

    const handleTranslateSummary = async () => {
        if (!user || !editableSummary || !selectedLanguage) return;

        const cost = settings?.summaryTranslationCost || 10;
        if ((userProfile?.tokenBalance || 0) < cost) {
            toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens to translate this summary.` });
            return;
        }

        setIsTranslating(true);
        try {
            const result = await translateSummary({ 
                summary: editableSummary, 
                targetLanguages: [selectedLanguage], 
                roomId: room.id, 
                userId: user.uid 
            });
            setEditableSummary(result);
            toast({ title: "Translation Complete!", description: "The summary has been translated." });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Translation Failed', description: error.message || "An unexpected error occurred." });
        } finally {
            setIsTranslating(false);
            setSelectedLanguage('');
        }
    };

    const downloadAsFile = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const formatSummaryForDownload = (summary: RoomSummary, lang?: string) => {
        let output = `Meeting Summary: ${summary.title}\n`;
        output += `Date: ${formatDate(summary.date)}\n\n`;
        output += '--- Participants ---\n';
        summary.presentParticipants.forEach(p => {
            output += `- ${p.name} (${p.email})\n`;
        });
        output += '\n--- Summary ---\n';
        const summaryText = lang ? summary.summary?.translations?.[lang] : summary.summary?.original;
        output += `${summaryText || 'Not available.'}\n\n`;
        output += '--- Action Items ---\n';
        if (summary.actionItems.length === 0) {
            output += 'No action items were recorded.\n';
        } else {
            summary.actionItems.forEach((item, index) => {
                const taskText = lang ? item.task?.translations?.[lang] : item.task?.original;
                output += `${index + 1}. ${taskText || 'Not available.'}`;
                if (item.personInCharge) output += ` (Owner: ${item.personInCharge})`;
                if (item.dueDate) output += ` [Due: ${item.dueDate}]`;
                output += '\n';
            });
        }
        return output;
    };
    
    const formatTranscriptForDownload = (transcript: Transcript) => {
        let output = `Transcript for: ${transcript.title}\n`;
        output += `Date: ${formatDate(transcript.date)}\n\n`;
        output += '--- Participants ---\n';
        transcript.presentParticipants.forEach(p => {
            output += `- ${p.name} (${p.email})\n`;
        });
        if (transcript.absentParticipants.length > 0) {
            output += '\n--- Absent ---\n';
            transcript.absentParticipants.forEach(p => {
                output += `- ${p.name} (${p.email})\n`;
            });
        }
        output += '\n--- Conversation Log ---\n';
        transcript.log.forEach(item => {
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            output += `[${time}] ${item.speakerName}: ${item.text}\n`;
        });
        return output;
    }
    
    const handleDownloadTranscript = async () => {
        if (!user) return;
        setIsDownloadingTranscript(true);
        try {
            const result = await getTranscriptAction(room.id, user.uid);
            if (result.success && result.transcript) {
                downloadAsFile(formatTranscriptForDownload(result.transcript), `${room.topic}-transcript.txt`);
                toast({ title: "Transcript Downloaded", description: "The full transcript has been saved." });
                onUpdate(); // Re-fetch room data to get the cached transcript
            } else {
                throw new Error(result.error || 'Failed to generate transcript.');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
        } finally {
            setIsDownloadingTranscript(false);
        }
    }
    
    if (!editableSummary) return null;


    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                 <div className="py-4 space-y-4">
                     <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/3 space-y-4">
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">Participants</CardTitle></CardHeader>
                                <CardContent>
                                    <ul className="text-sm space-y-1">
                                        {editableSummary && editableSummary.presentParticipants && editableSummary.presentParticipants.map(p => <li key={p.email}>{p.name}</li>)}
                                    </ul>
                                </CardContent>
                            </Card>
                            <Card>
                                 <CardHeader className="pb-2"><CardTitle className="text-base">Translate</CardTitle></CardHeader>
                                 <CardContent className="space-y-2">
                                    <Select onValueChange={setSelectedLanguage} value={selectedLanguage}>
                                        <SelectTrigger><SelectValue placeholder="Select language..." /></SelectTrigger>
                                        <SelectContent>
                                             {languages.map(lang => <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button className="w-full" onClick={handleTranslateSummary} disabled={isTranslating || !selectedLanguage}>
                                        {isTranslating ? <LoaderCircle className="animate-spin mr-2" /> : <TranslateIcon className="mr-2" />}
                                        Translate ({settings?.summaryTranslationCost || 10} tokens)
                                    </Button>
                                 </CardContent>
                            </Card>
                        </div>
                        <div className="w-full sm:w-2/3">
                            <Tabs defaultValue="original" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                     <TabsTrigger value="original">Original Summary</TabsTrigger>
                                     <TabsTrigger value="action-items">Action Items ({editableSummary.actionItems?.length || 0})</TabsTrigger>
                                </TabsList>
                                <TabsContent value="original">
                                    <div className="p-4 border rounded-md min-h-[200px] mt-2 text-sm whitespace-pre-wrap">
                                        {editableSummary.summary?.original}
                                    </div>
                                </TabsContent>
                                 <TabsContent value="action-items">
                                     <div className="p-4 border rounded-md min-h-[200px] mt-2 space-y-2 text-sm">
                                        {editableSummary.actionItems && editableSummary.actionItems.length > 0 ? (
                                            editableSummary.actionItems.map((item, i) => (
                                                <div key={i} className="pb-2 border-b last:border-b-0">
                                                    <p>{i+1}. {item.task.original}</p>
                                                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                                                        {item.personInCharge && <span>Owner: {item.personInCharge}</span>}
                                                        {item.dueDate && <span>Due: {item.dueDate}</span>}
                                                    </div>
                                                </div>
                                            ))
                                        ) : <p className="text-muted-foreground text-center">No action items were identified.</p>}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                     </div>
                 </div>
                 <DialogFooter>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Download</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => downloadAsFile(formatSummaryForDownload(editableSummary), `${room.topic}-summary.txt`)}>
                                Summary (Original)
                            </DropdownMenuItem>
                            {editableSummary.summary?.translations && Object.entries(editableSummary.summary.translations).map(([lang, text]) => (
                                <DropdownMenuItem key={lang} onClick={() => downloadAsFile(formatSummaryForDownload(editableSummary, lang), `${room.topic}-summary-${lang}.txt`)}>
                                    Summary ({languages.find(l => l.value === lang)?.label || lang})
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleDownloadTranscript} disabled={isDownloadingTranscript}>
                                {isDownloadingTranscript ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : null}
                                Transcript ({room.transcript ? 'Free' : `${settings?.transcriptCost} Tokens`})
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => setIsOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ManageRoomDialog({ room, onUpdate }: { room: ClientSyncRoom; onUpdate: () => void }) {
     const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [user] = useAuthState(auth);

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
                    <p className="text-sm text-muted-foreground">This action will reconcile any costs and permanently delete the room. This cannot be undone.</p>
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
                                <AlertDialogDescription>
                                    This will permanently delete the room and notify invited participants.
                                    {(room.initialCost ?? 0) > 0 && 
                                        <span className="font-bold block mt-2"> {room.initialCost} tokens will be refunded to your account.</span>
                                    }
                                    This action cannot be undone.
                                </AlertDialogDescription>
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
    const [isSummarizing, setIsSummarizing] = useState<string | null>(null);
    
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
                     batch.update(userDocRef, { syncOnlineUsage: increment(freeMinutesToDeduct * 60 * 1000) });
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

    const handleGenerateSummary = async (roomId: string) => {
        if (!user) return;
        setIsSummarizing(roomId);
        try {
            const result = await summarizeRoomAction(roomId, user.uid);
            if(result.success) {
                toast({ title: 'Summary Generating', description: 'The AI is creating your summary. It will appear here shortly.'});
            } else {
                 toast({ variant: 'destructive', title: 'Summary Failed', description: result.error || 'Could not start summary generation.' });
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Client Error', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSummarizing(null);
        }
    }

    const { active, scheduled, closed } = useMemo(() => {
        return invitedRooms.reduce((acc, room) => {
            if (room.status === 'active') {
                acc.active.push(room);
            } else if (room.status === 'scheduled') {
                acc.scheduled.push(room);
            } else if (room.status === 'closed') {
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

                                    {isCreator && room.status === 'closed' && !room.summary && (
                                        <Button size="sm" onClick={() => handleGenerateSummary(room.id)} disabled={isSummarizing === room.id}>
                                            {isSummarizing === room.id ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                            Generate Summary
                                        </Button>
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
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <CardTitle>Voice Rooms</CardTitle>
                        <VoiceRoomsInfoDialog />
                    </div>
                </div>
                <CardDescription>
                    Schedule a private room and invite others for a real-time, multi-language voice conversation.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="your-rooms" data-tour="so-your-rooms-button">Your Rooms</TabsTrigger>
                        <TabsTrigger value="schedule" data-tour="so-schedule-button" onClick={() => resetForm()}>Schedule a Room</TabsTrigger>
                    </TabsList>
                    <TabsContent value="your-rooms" className="mt-4">
                        {user && (
                            <Card data-tour="so-room-list">
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2"><List /> Room List</CardTitle>
                                        <Button variant="outline" size="icon" onClick={fetchInvitedRooms} disabled={isFetchingRooms}>
                                            <RefreshCw className={cn("h-4 w-4", isFetchingRooms && "animate-spin")} />
                                        </Button>
                                    </div>
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
                                <CardTitle>{isEditMode ? 'Edit' : 'Schedule'} a Room</CardTitle>
                                <CardDescription>Set the details for your meeting. The cost will be calculated and displayed below.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form id="create-room-form" onSubmit={handleSubmitRoom} className="space-y-4">
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
                                    
                                    <div className="grid grid-cols-2 gap-4">
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
                                                <PopoverContent className="w-auto p-0">
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
            </CardContent>
        </Card>
    );
}
