
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, serverTimestamp, setDoc, doc, query, where, getDocs, deleteDoc, writeBatch, getDocs as getSubCollectionDocs, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare, ShieldCheck, XCircle, UserX, UserCheck, FileText, Edit, Save, Share2, Download } from 'lucide-react';
import type { SyncRoom } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { getAppSettings, type AppSettings } from '@/services/settings';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { updateRoomSummary } from '@/actions/room';


interface InvitedRoom extends SyncRoom {
    id: string;
}

function RoomSummaryDialog({ room, user, onUpdate }: { room: InvitedRoom; user: any; onUpdate: () => void }) {
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editableSummary, setEditableSummary] = useState(room.summary);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setEditableSummary(room.summary);
    }, [room.summary]);

    const isEmcee = useMemo(() => {
        if (!user || !room) return false;
        return room.creatorUid === user.uid || (user.email && room.emceeEmails?.includes(user.email));
    }, [user, room]);

    const formatDate = (dateString: string) => {
        if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return "Unknown";
        }
        try {
            const date = new Date(dateString);
             // Check if date is valid, Safari can be tricky with 'YYYY-MM-DD'
            if (isNaN(date.getTime())) {
                const parts = dateString.split('-').map(Number);
                const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                 if(isNaN(utcDate.getTime())) return "Unknown";
                 return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
            }
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        } catch (e) {
            return "Unknown";
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditableSummary(prev => prev ? { ...prev, [name]: value } : null);
    };

    const handleActionItemChange = (index: number, field: string, value: string) => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems];
        newActionItems[index] = { ...newActionItems[index], [field]: value };
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const addActionItem = () => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems, { task: '', personInCharge: '', dueDate: '' }];
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const removeActionItem = (index: number) => {
        if (!editableSummary) return;
        const newActionItems = editableSummary.actionItems.filter((_, i) => i !== index);
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const handleSaveChanges = async () => {
        if (!editableSummary) return;
        setIsSaving(true);
        try {
            const result = await updateRoomSummary(room.id, editableSummary);
            if (result.success) {
                toast({ title: 'Success', description: 'Summary updated successfully.' });
                setIsEditing(false);
                onUpdate();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to update summary.' });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleShare = () => {
        const shareLink = `${window.location.origin}/sync-room-summary/${room.id}`;
        navigator.clipboard.writeText(shareLink);
        toast({ title: "Link Copied!", description: "A shareable link has been copied to your clipboard." });
    };
    
    const handleDownload = () => {
        if (!editableSummary) return;

        let content = `Meeting Summary\n`;
        content += `================\n\n`;
        content += `Title: ${editableSummary.title}\n`;
        content += `Date: ${formatDate(editableSummary.date)}\n\n`;
        content += `Summary:\n${editableSummary.summary}\n\n`;
        content += `Action Items:\n`;
        editableSummary.actionItems.forEach((item, index) => {
            content += `${index + 1}. ${item.task}\n`;
            content += `   - Assigned to: ${item.personInCharge || 'N/A'}\n`;
            content += `   - Due: ${item.dueDate || 'N/A'}\n`;
        });
        content += `\nParticipants Present:\n`;
         editableSummary.presentParticipants.forEach(p => {
             content += `- ${p.name} (${p.email})\n`;
        });
        content += `\nParticipants Absent:\n`;
         editableSummary.absentParticipants.forEach(p => {
             content += `- ${p.name} (${p.email})\n`;
        });


        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${editableSummary.title.replace(/\s+/g, '_')}_summary.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

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
                    {isEditing ? (
                        <Input 
                            name="title" 
                            value={editableSummary.title} 
                            onChange={handleInputChange} 
                            className="text-lg font-semibold h-auto p-0 border-0 shadow-none focus-visible:ring-0"
                        />
                    ) : (
                        <DialogTitle>{editableSummary.title}</DialogTitle>
                    )}
                    <DialogDescription>
                        Meeting held on {formatDate(editableSummary.date)}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-6 pr-4">
                    <div>
                        <h3 className="font-semibold text-lg mb-2">Summary</h3>
                        {isEditing ? (
                            <Textarea 
                                name="summary"
                                value={editableSummary.summary} 
                                onChange={handleInputChange}
                                className="w-full min-h-[150px]"
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{editableSummary.summary}</p>
                        )}
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="font-semibold text-lg">Action Items</h3>
                             {isEditing && (
                                <Button size="sm" variant="outline" onClick={addActionItem}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
                             )}
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>PIC</TableHead>
                                    <TableHead>Due</TableHead>
                                    {isEditing && <TableHead className="w-[50px]"></TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {editableSummary.actionItems.map((item, index) => (
                                    <TableRow key={`action-${item.task}-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.task} onChange={(e) => handleActionItemChange(index, 'task', e.target.value)} />
                                            ) : (
                                                item.task
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.personInCharge || ''} onChange={(e) => handleActionItemChange(index, 'personInCharge', e.target.value)} />
                                            ) : (
                                                item.personInCharge || 'N/A'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.dueDate || ''} onChange={(e) => handleActionItemChange(index, 'dueDate', e.target.value)} />
                                            ) : (
                                                item.dueDate || 'N/A'
                                            )}
                                        </TableCell>
                                         {isEditing && (
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeActionItem(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                         )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg">Participants</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium flex items-center gap-1.5 text-green-600"><UserCheck/> Present</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[30px]">#</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {editableSummary.presentParticipants.map((p, i) => (
                                            <TableRow key={`present-${p.email}-${i}`}>
                                                <TableCell>{i + 1}</TableCell>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell>{p.email}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                             <div className="space-y-2">
                                <h4 className="font-medium flex items-center gap-1.5 text-red-600"><UserX/> Absent</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[30px]">#</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {editableSummary.absentParticipants.map((p, i) => (
                                            <TableRow key={`absent-${p.email}-${i}`}>
                                                <TableCell>{i + 1}</TableCell>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell>{p.email}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </div>
                </ScrollArea>
                 <DialogFooter>
                    {isEditing ? (
                        <>
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSaveChanges} disabled={isSaving}>
                                {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Save Changes
                            </Button>
                        </>
                    ) : (
                         <>
                             <div className="flex-grow flex gap-2">
                                <Button variant="secondary" onClick={handleShare}><Share2 className="mr-2 h-4 w-4"/> Share</Button>
                                <Button variant="secondary" onClick={handleDownload}><Download className="mr-2 h-4 w-4"/> Download</Button>
                            </div>
                            {isEmcee && <Button variant="secondary" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> Edit</Button>}
                            <DialogClose asChild>
                                <Button variant="outline">Close</Button>
                            </DialogClose>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function SyncOnlineHome() {
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();

    const [isCreating, setIsCreating] = useState(false);
    const [roomTopic, setRoomTopic] = useState('');
    const [creatorLanguage, setCreatorLanguage] = useState<AzureLanguageCode | ''>('');
    const [inviteeEmails, setInviteeEmails] = useState('');
    const [emceeEmails, setEmceeEmails] = useState<string[]>([]);
    const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
    
    const [invitedRooms, setInvitedRooms] = useState<InvitedRoom[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(true);

    const [isClient, setIsClient] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    
    // State for the blocked users dialog, now managed locally per dialog instance
    const [currentlyManagedRoom, setCurrentlyManagedRoom] = useState<InvitedRoom | null>(null);

    useEffect(() => {
        setIsClient(true);
        if (user?.email && !emceeEmails.includes(user.email)) {
            setEmceeEmails([user.email]);
        }
        getAppSettings().then(setSettings);
    }, [user, emceeEmails]);

    const parsedInviteeEmails = useMemo(() => {
        return inviteeEmails.split(/[ ,]+/).map(email => email.trim()).filter(Boolean);
    }, [inviteeEmails]);
    
     const toggleEmcee = (email: string) => {
        setEmceeEmails(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
    };

    const fetchInvitedRooms = useCallback(async () => {
        if (!user) {
            setInvitedRooms([]);
            setIsFetchingRooms(false);
            return;
        }
        setIsFetchingRooms(true);
        try {
            const roomsRef = collection(db, 'syncRooms');
            const q = query(roomsRef, where("invitedEmails", "array-contains", user.email));
            const querySnapshot = await getDocs(q);
            const rooms = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as InvitedRoom))
                // Keep active rooms OR closed rooms that have a summary
                .filter(room => room.status === 'active' || room.summary)
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); // Sort by newest first
            
            setInvitedRooms(rooms);
        } catch (error: any) {
            console.error("Error fetching invited rooms:", error);
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                console.error("FULL FIREBASE ERROR - You probably need to create an index. Look for a URL in this error message to create it automatically:", error);
            } else {
                toast({ variant: 'destructive', title: 'Could not fetch rooms', description: 'There was an error fetching your room invitations.' });
            }
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
    
    const resetAndClose = () => {
        setRoomTopic('');
        setCreatorLanguage('');
        setInviteeEmails('');
        setEmceeEmails(user?.email ? [user.email] : []);
        setIsCreateRoomDialogOpen(false);
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create a room.' });
            return;
        }
        if (!roomTopic || !creatorLanguage) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide a topic and select your language.' });
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
        
        setIsCreating(true);
        try {
            const batch = writeBatch(db);

            const newRoomRef = doc(collection(db, 'syncRooms'));
            const newRoom: Omit<SyncRoom, 'id'> = {
                topic: roomTopic,
                creatorUid: user.uid,
                creatorName: user.displayName || user.email?.split('@')[0] || 'Creator',
                createdAt: serverTimestamp(),
                status: 'active',
                invitedEmails: allInvitedEmails,
                emceeEmails: [...new Set(emceeEmails)],
                blockedUsers: [],
                lastActivityAt: serverTimestamp(),
            };
            batch.set(newRoomRef, newRoom);

            await batch.commit();
            
            toast({ title: "Room Created!", description: "Your new room is available in the list below." });
            fetchInvitedRooms();
            resetAndClose();


        } catch (error) {
            console.error("Error creating room:", error);
            toast({ variant: "destructive", title: "error when i tried to create room" });
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        try {
            const roomRef = doc(db, 'syncRooms', roomId);
            await updateDoc(roomRef, {
                status: 'closed',
                lastActivityAt: serverTimestamp(),
            });
            
            toast({ title: "Room Closed", description: "The room has been closed for all participants." });
            fetchInvitedRooms();
        } catch (error) {
            console.error("Error closing room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not close the room.' });
        }
    };

    const handleUnblockUser = useCallback(async (room: InvitedRoom, userToUnblock: any) => {
        try {
            const roomRef = doc(db, 'syncRooms', room.id);
            await updateDoc(roomRef, {
                blockedUsers: arrayRemove(userToUnblock)
            });
            toast({ title: 'User Unblocked', description: 'The user can now rejoin the room.' });
            
            // Refresh the main room list to update its state globally
            setInvitedRooms(prevRooms => prevRooms.map(r => {
                if (r.id === room.id) {
                    return {
                        ...r,
                        blockedUsers: r.blockedUsers?.filter(u => u.uid !== userToUnblock.uid)
                    };
                }
                return r;
            }));

        } catch (error) {
            console.error('Error unblocking user:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not unblock the user.' });
        }
    }, []);

    if (loading || !isClient) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Create a private room for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <LoaderCircle className="animate-spin h-5 w-5" />
                        <p>Loading user data...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Create a private room and invite others for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Dialog open={isCreateRoomDialogOpen} onOpenChange={(open) => {
                        setIsCreateRoomDialogOpen(open);
                        if (!open) resetAndClose();
                     }}>
                        <DialogTrigger asChild>
                             <Button disabled={!user}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Create New Room
                            </Button>
                        </DialogTrigger>
                        {!user && <p className="text-sm text-muted-foreground mt-2">Please log in to create a room.</p>}

                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Create a Sync Room</DialogTitle>
                                <DialogDescription>
                                    Fill in the details below. Once created, you'll get a shareable link. The max number of users per room is {settings?.maxUsersPerRoom || 5}.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateRoom} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="topic">Room Topic</Label>
                                    <Input id="topic" value={roomTopic} onChange={(e) => setRoomTopic(e.target.value)} placeholder="e.g., Planning our trip to Bali" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="language">Your Spoken Language</Label>
                                    <Select onValueChange={(v) => setCreatorLanguage(v as AzureLanguageCode)} value={creatorLanguage} required>
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
                                <div className="space-y-2">
                                    <Label htmlFor="invitees">Invite Emails (comma-separated)</Label>
                                    <Textarea id="invitees" value={inviteeEmails} onChange={(e) => setInviteeEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com" />
                                </div>

                                {(parsedInviteeEmails.length > 0 || user?.email) && (
                                    <div className="space-y-3">
                                        <Separator/>
                                        <Label className="font-semibold flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-primary"/>
                                            Assign Emcees
                                        </Label>
                                        <ScrollArea className="max-h-32">
                                            <div className="space-y-2 pr-4">
                                                {user?.email && (
                                                     <div className="flex items-center space-x-2">
                                                        <Checkbox id={user.email} checked={emceeEmails.includes(user.email)} onCheckedChange={() => toggleEmcee(user.email)} />
                                                        <Label htmlFor={user.email} className="font-normal w-full truncate">{user.email} (Creator)</Label>
                                                    </div>
                                                )}
                                                {parsedInviteeEmails.map(email => (
                                                    <div key={email} className="flex items-center space-x-2">
                                                        <Checkbox id={email} checked={emceeEmails.includes(email)} onCheckedChange={() => toggleEmcee(email)} />
                                                        <Label htmlFor={email} className="font-normal w-full truncate">{email}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                        <Separator/>
                                    </div>
                                )}

                                <DialogFooter>
                                    <Button type="submit" disabled={isCreating}>
                                        {isCreating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Create Room
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            {user && isClient && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><List /> Your Invited Rooms</CardTitle>
                        <CardDescription>Rooms you have been invited to or have created.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isFetchingRooms ? (
                             <div className="flex items-center gap-2 text-muted-foreground">
                                <LoaderCircle className="animate-spin h-5 w-5" />
                                <p>Fetching invitations...</p>
                            </div>
                        ) : invitedRooms.length > 0 ? (
                            <ul className="space-y-3">
                                {invitedRooms.map(room => {
                                    const isBlocked = room.blockedUsers?.some(bu => bu.uid === user.uid);
                                    const isCreator = room.creatorUid === user.uid;

                                    return (
                                        <li key={room.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg gap-2">
                                            <div className="flex-grow">
                                                <p className="font-semibold">{room.topic}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-muted-foreground">{room.createdAt ? new Date((room.createdAt as any).toDate()).toLocaleString() : ''}</p>
                                                    {room.status === 'closed' && (
                                                        <Badge variant={room.summary ? 'default' : 'destructive'}>
                                                            {room.summary ? 'Summary Available' : 'Closed'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isBlocked ? (
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
                                                ) : null}

                                                {room.status === 'active' && (
                                                    <Button asChild disabled={isBlocked}>
                                                        <Link href={`/sync-room/${room.id}`}>Join Room</Link>
                                                    </Button>
                                                )}

                                                {room.summary && (
                                                    <RoomSummaryDialog room={room} user={user} onUpdate={fetchInvitedRooms} />
                                                )}
                                                
                                                {isCreator && room.blockedUsers && room.blockedUsers.length > 0 && (
                                                    <Dialog>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <DialogTrigger asChild>
                                                                    <TooltipTrigger asChild>
                                                                        <Button variant="outline" size="icon">
                                                                            <UserX className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                </DialogTrigger>
                                                                <TooltipContent><p>Manage Blocked Users</p></TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Manage Blocked Users for "{room.topic}"</DialogTitle>
                                                                <DialogDescription>
                                                                    You can re-admit users who were previously removed from this room.
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <div className="py-4">
                                                                {room.blockedUsers && room.blockedUsers.length > 0 ? (
                                                                    <ul className="space-y-2">
                                                                        {room.blockedUsers.map(bu => (
                                                                            <li key={bu.uid} className="flex justify-between items-center">
                                                                                <span>{bu.email}</span>
                                                                                <Button variant="secondary" size="sm" onClick={() => handleUnblockUser(room, bu)}>
                                                                                    <UserCheck className="mr-2 h-4 w-4"/>
                                                                                    Re-admit
                                                                                </Button>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                ) : <p className="text-muted-foreground">No users have been blocked from this room.</p>}
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                )}

                                                {isCreator && room.status !== 'closed' && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="destructive" size="icon">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will close the room for all participants. This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction 
                                                                    onClick={() => handleDeleteRoom(room.id)}
                                                                >
                                                                    Close Room
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : (
                            <p className="text-muted-foreground">You have no active room invitations.</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

    