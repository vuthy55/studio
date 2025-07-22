
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, serverTimestamp, setDoc, doc, query, where, getDocs, deleteDoc, writeBatch, getDocs as getSubCollectionDocs } from 'firebase/firestore';
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
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare } from 'lucide-react';
import type { SyncRoom, Participant } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InvitedRoom extends SyncRoom {
    id: string;
}

export default function SyncOnlineHome() {
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();

    const [isCreating, setIsCreating] = useState(false);
    const [roomTopic, setRoomTopic] = useState('');
    const [creatorLanguage, setCreatorLanguage] = useState<AzureLanguageCode | ''>('');
    const [inviteeEmails, setInviteeEmails] = useState('');
    
    const [createdRoomLink, setCreatedRoomLink] = useState('');
    
    const [invitedRooms, setInvitedRooms] = useState<InvitedRoom[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(true);

    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

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

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create a room.' });
            return;
        }
        if (!roomTopic || !creatorLanguage) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide a topic and select your language.' });
            return;
        }

        setIsCreating(true);
        try {
            const emails = inviteeEmails.split(/[ ,]+/).map(email => email.trim()).filter(Boolean); // Handles commas and spaces
            if (!emails.includes(user.email!)) {
                emails.push(user.email!);
            }
            
            const batch = writeBatch(db);

            const newRoomRef = doc(collection(db, 'syncRooms'));
            const newRoom: Omit<SyncRoom, 'id'> = {
                topic: roomTopic,
                creatorUid: user.uid,
                createdAt: serverTimestamp(),
                status: 'active',
                invitedEmails: emails,
                emceeUids: [user.uid],
                lastActivityAt: serverTimestamp(),
            };
            batch.set(newRoomRef, newRoom);

            const participantRef = doc(db, 'syncRooms', newRoomRef.id, 'participants', user.uid);
            const creatorParticipant: Participant = {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Creator',
                email: user.email!,
                selectedLanguage: creatorLanguage,
            };
            batch.set(participantRef, creatorParticipant);

            await batch.commit();
            
            const joinLink = `${window.location.origin}/sync-room/${newRoomRef.id}`;
            setCreatedRoomLink(joinLink);
            fetchInvitedRooms(); // Refresh the list to show the new room immediately

        } catch (error) {
            console.error("Error creating room:", error);
            toast({ variant: "destructive", title: "error when i tried to create room" });
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        try {
            const batch = writeBatch(db);
    
            const messagesRef = collection(db, 'syncRooms', roomId, 'messages');
            const messagesSnapshot = await getSubCollectionDocs(messagesRef);
            messagesSnapshot.forEach(doc => batch.delete(doc.ref));

            const participantsRef = collection(db, 'syncRooms', roomId, 'participants');
            const participantsSnapshot = await getSubCollectionDocs(participantsRef);
            participantsSnapshot.forEach(doc => batch.delete(doc.ref));

            const roomRef = doc(db, 'syncRooms', roomId);
            batch.delete(roomRef);

            await batch.commit();
            
            toast({ title: "Room Deleted", description: "The sync room and all its data have been deleted." });
            fetchInvitedRooms();
        } catch (error) {
            console.error("Error deleting room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete the room.' });
        }
    };
    
    const copyToClipboard = () => {
        if (typeof window !== 'undefined') {
            navigator.clipboard.writeText(createdRoomLink);
            toast({ title: 'Copied!', description: 'Room link copied to clipboard.' });
        }
    };
    
    const resetAndClose = () => {
        setRoomTopic('');
        setCreatorLanguage('');
        setInviteeEmails('');
        setCreatedRoomLink('');
    };

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
                    <Dialog onOpenChange={(open) => !open && resetAndClose()}>
                        <DialogTrigger asChild>
                             <Button disabled={!user}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Create New Room
                            </Button>
                        </DialogTrigger>
                        {!user && <p className="text-sm text-muted-foreground mt-2">Please log in to create a room.</p>}

                        <DialogContent className="sm:max-w-[425px]">
                            {!createdRoomLink ? (
                                <>
                                    <DialogHeader>
                                        <DialogTitle>Create a Sync Room</DialogTitle>
                                        <DialogDescription>
                                            Fill in the details below. Once created, you'll get a shareable link.
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
                                        <DialogFooter>
                                            <Button type="submit" disabled={isCreating}>
                                                {isCreating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Create Room
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </>
                            ) : (
                                 <>
                                    <DialogHeader>
                                        <DialogTitle>Room Created!</DialogTitle>
                                        <DialogDescription>
                                            Share this link with your friends to invite them to the room.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <Input value={createdRoomLink} readOnly />
                                            <Button type="button" size="sm" onClick={copyToClipboard}>
                                                <span className="sr-only">Copy</span>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                         <Button asChild type="button">
                                            <Link href={createdRoomLink.replace(window.location.origin, '')}>
                                                Go to Room
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                    <DialogFooter>
                                         <DialogClose asChild>
                                            <Button type="button" variant="secondary" onClick={resetAndClose}>
                                              Close
                                            </Button>
                                          </DialogClose>
                                    </DialogFooter>
                                </>
                            )}
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
                                {invitedRooms.map(room => (
                                    <li key={room.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg gap-2">
                                        <div className="flex-grow">
                                            <p className="font-semibold">{room.topic}</p>
                                            <div className="flex items-center gap-2">
                                                 <p className="text-sm text-muted-foreground">{room.createdAt ? new Date(room.createdAt.toDate()).toLocaleString() : ''}</p>
                                                 {room.status === 'closed' && <Badge variant="destructive">Closed</Badge>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button asChild>
                                                <Link href={`/sync-room/${room.id}`}>{room.status === 'closed' ? 'View Summary' : 'Join Room'}</Link>
                                            </Button>
                                            {room.creatorUid === user.uid && (
                                                <AlertDialog onOpenChange={() => setDeleteConfirmation('')}>
                                                    <AlertDialogTrigger asChild>
                                                         <Button variant="destructive" size="icon">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently delete the room and all of its data.
                                                                <br/><br/>
                                                                Please type <strong>delete</strong> to confirm.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <Input 
                                                            id="delete-confirm"
                                                            value={deleteConfirmation}
                                                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                                                            className="mt-2"
                                                        />
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                onClick={() => handleDeleteRoom(room.id)} 
                                                                disabled={deleteConfirmation.toLowerCase() !== 'delete'}
                                                            >
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-muted-foreground">You have no pending room invitations.</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

    