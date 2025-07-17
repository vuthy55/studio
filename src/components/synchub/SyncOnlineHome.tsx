
"use client";

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, PlusCircle, Wifi, Copy } from 'lucide-react';
import type { SyncRoom, Participant } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SyncOnlineHome() {
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    const [isMounted, setIsMounted] = useState(false);

    const [isCreating, setIsCreating] = useState(false);
    const [roomTopic, setRoomTopic] = useState('');
    const [spokenLanguage, setSpokenLanguage] = useState<AzureLanguageCode | ''>('');
    const [inviteeEmails, setInviteeEmails] = useState('');
    
    const [createdRoomLink, setCreatedRoomLink] = useState('');

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create a room.' });
            return;
        }
        if (!roomTopic || !spokenLanguage) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide a topic and select your language.' });
            return;
        }

        setIsCreating(true);
        try {
            const emails = inviteeEmails.split(',').map(email => email.trim()).filter(Boolean);
            if (!emails.includes(user.email!)) {
                emails.push(user.email!);
            }
            
            const newRoom: Omit<SyncRoom, 'id' | 'createdAt'> = {
                topic: roomTopic,
                creatorUid: user.uid,
                status: 'active',
                invitedEmails: emails,
                activeSpeakerUid: null,
                emceeUids: [user.uid],
            };

            const roomRef = await addDoc(collection(db, 'syncRooms'), {
                ...newRoom,
                createdAt: serverTimestamp()
            });

            const creatorParticipant: Participant = {
                name: user.displayName || 'Creator',
                email: user.email!,
                uid: user.uid,
                selectedLanguage: spokenLanguage,
                isEmcee: true,
                isMuted: false,
            };

            await setDoc(doc(db, `syncRooms/${roomRef.id}/participants`, user.uid), creatorParticipant);
            
            const joinLink = `${window.location.origin}/sync-room/${roomRef.id}`;
            setCreatedRoomLink(joinLink);

        } catch (error) {
            console.error("Error creating room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not create the room.' });
        } finally {
            setIsCreating(false);
        }
    };
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(createdRoomLink);
        toast({ title: 'Copied!', description: 'Room link copied to clipboard.' });
    };
    
    const resetAndClose = () => {
        setRoomTopic('');
        setSpokenLanguage('');
        setInviteeEmails('');
        setCreatedRoomLink('');
    };

    if (!isMounted || loading) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Create a private room for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        <LoaderCircle className="animate-spin h-5 w-5" />
                        <p>Loading...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                <CardDescription>Create a private room and invite others to have a real-time, multi-language voice conversation.</CardDescription>
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
                                        <Select onValueChange={(v) => setSpokenLanguage(v as AzureLanguageCode)} value={spokenLanguage}>
                                            <SelectTrigger id="language">
                                                <SelectValue placeholder="Select your language..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {azureLanguages.map(lang => (
                                                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                                ))}
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
                                     <Button type="button" onClick={() => router.push(createdRoomLink.replace(window.location.origin, ''))}>
                                        Go to Room
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
    );
}
