
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare, ShieldCheck, XCircle, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw, Calendar as CalendarIcon, Users, Link as LinkIcon, Send, HelpCircle } from 'lucide-react';
import type { Vibe } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, inviteToVibe } from '@/actions/common-room';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';


function CreateVibeDialog({ onVibeCreated }: { onVibeCreated: () => void }) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [topic, setTopic] = useState('');
    const [isPublic, setIsPublic] = useState(true);

    const handleCreateVibe = async () => {
        if (!topic.trim()) {
            toast({ variant: 'destructive', title: 'Topic is required' });
            return;
        }
        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }

        setIsSubmitting(true);
        try {
            await startVibe({ 
                topic, 
                isPublic, 
                creatorId: user.uid, 
                creatorName: user.displayName || user.email,
                creatorEmail: user.email,
            });
            toast({ title: 'Vibe Created!', description: 'Your new common room is ready.' });
            setIsOpen(false);
            setTopic('');
            setIsPublic(true);
            onVibeCreated();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4"/>
                    Start a Vibe
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Start a New Vibe</DialogTitle>
                    <DialogDescription>Create a new discussion topic for the community.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="vibe-topic">Topic</Label>
                        <Input id="vibe-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., Best street food in Bangkok?"/>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="vibe-public" checked={isPublic} onCheckedChange={(checked) => setIsPublic(!!checked)} />
                        <Label htmlFor="vibe-public">Public (anyone can view and post)</Label>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleCreateVibe} disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                        Create Vibe
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function InviteDialog({ vibe }: { vibe: Vibe }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emails, setEmails] = useState('');

    const handleInvite = async () => {
        if (!emails.trim()) {
            toast({ variant: 'destructive', title: 'Emails are required' });
            return;
        }

        setIsSubmitting(true);
        try {
            await inviteToVibe(vibe.id, emails.split(/[ ,]+/).map(e => e.trim()).filter(Boolean));
            toast({ title: 'Invites Sent!', description: 'Your friends have been invited to the Vibe.' });
            setIsOpen(false);
            setEmails('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Invite</Button>
            </DialogTrigger>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Invite to "{vibe.topic}"</DialogTitle>
                    <DialogDescription>Enter emails separated by commas. They will receive an email and in-app notification.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com"/>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleInvite} disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                        Send Invites
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export default function CommonRoomClient() {
    const { user, userProfile, loading } = useUserData();
    const { toast } = useToast();
    const [vibes, setVibes] = useState<Vibe[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const fetchVibes = useCallback(async () => {
        if (!user || !user.email) return;
        setIsFetching(true);
        try {
            const fetchedVibes = await getVibes(user.email);
            setVibes(fetchedVibes);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch Common Rooms.' });
        } finally {
            setIsFetching(false);
        }
    }, [user, toast]);

    useEffect(() => {
        fetchVibes();
    }, [fetchVibes]);

    const copyInviteLink = (vibeId: string) => {
        const link = `${window.location.origin}/join/${vibeId}`;
        navigator.clipboard.writeText(link);
        toast({ title: 'Invite Link Copied!', description: 'Share this link to invite others.' });
    };

    const { publicVibes, myVibes } = useMemo(() => {
        const publicVibes: Vibe[] = [];
        const myVibes: Vibe[] = [];

        vibes.forEach(vibe => {
            if (vibe.isPublic) {
                publicVibes.push(vibe);
            }
            if (vibe.creatorId === user?.uid || vibe.invitedEmails.includes(user?.email || '')) {
                if(!vibe.isPublic) myVibes.push(vibe);
            }
        });
        return { publicVibes, myVibes };
    }, [vibes, user?.uid, user?.email]);

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <CreateVibeDialog onVibeCreated={fetchVibes} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>My Private Vibes & Invites</CardTitle>
                    <CardDescription>Rooms you've created or been personally invited to.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? <LoaderCircle className="animate-spin" /> : (
                        myVibes.length > 0 ? (
                            <div className="space-y-3">
                                {myVibes.map(vibe => (
                                    <Card key={vibe.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div className="flex-grow">
                                            <p className="font-semibold">{vibe.topic}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Started by {vibe.creatorId === user?.uid ? 'you' : vibe.creatorName} • {vibe.postsCount || 0} posts
                                                {vibe.lastPostAt && ` • Last post ${formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })} by ${vibe.lastPostBy}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            {vibe.creatorId === user?.uid && <InviteDialog vibe={vibe} />}
                                            <Button asChild><Link href={`/common-room/${vibe.id}`}>Enter Vibe</Link></Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : <p className="text-muted-foreground text-sm">No private vibes yet.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Public Vibes</CardTitle>
                    <CardDescription>Open discussions for everyone in the community.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? <LoaderCircle className="animate-spin" /> : (
                        publicVibes.length > 0 ? (
                            <div className="space-y-3">
                                {publicVibes.map(vibe => (
                                    <Card key={vibe.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div className="flex-grow">
                                            <p className="font-semibold">{vibe.topic}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Started by {vibe.creatorName} • {vibe.postsCount || 0} posts
                                                {vibe.lastPostAt && ` • Last post ${formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })} by ${vibe.lastPostBy}`}
                                            </p>
                                        </div>
                                         <div className="flex items-center gap-2 self-end sm:self-center">
                                            <Button asChild><Link href={`/common-room/${vibe.id}`}>Enter Vibe</Link></Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : <p className="text-muted-foreground text-sm">No public vibes yet. Why not start one?</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
