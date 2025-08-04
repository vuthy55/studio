
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
    const { user } = useUserData();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emails, setEmails] = useState('');

    const handleInvite = async () => {
        if (!emails.trim()) {
            toast({ variant: 'destructive', title: 'Emails are required' });
            return;
        }
        if (!user || !user.displayName) return;

        setIsSubmitting(true);
        try {
            await inviteToVibe(vibe.id, emails.split(/[ ,]+/).map(e => e.trim()).filter(Boolean), vibe.topic, user.displayName);
            toast({ title: 'Invites Sent!', description: 'Your friends have been invited to the Vibe.' });
            setIsOpen(false);
            setEmails('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    const copyInviteLink = () => {
        const link = `${window.location.origin}/join/${vibe.id}`;
        navigator.clipboard.writeText(link);
        toast({ title: 'Invite Link Copied!', description: 'Share this link to invite others.' });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Invite</Button>
            </DialogTrigger>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Invite to "{vibe.topic}"</DialogTitle>
                    <DialogDescription>Enter emails separated by commas. They will receive an email and in-app notification. Or, copy the invite link.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com"/>
                    <Button variant="secondary" onClick={copyInviteLink} className="w-full">
                        <Copy className="mr-2 h-4 w-4" /> Copy Invite Link
                    </Button>
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
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const [vibes, setVibes] = useState<Vibe[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const fetchVibes = useCallback(async () => {
        console.log('[DEBUG] CommonRoomClient: fetchVibes called.');
        if (!user || !user.email) {
            console.log('[DEBUG] CommonRoomClient: No user or user email, returning.');
            return;
        }
        setIsFetching(true);
        console.log(`[DEBUG] CommonRoomClient: Fetching vibes for user: ${user.email}`);
        try {
            const fetchedVibes = await getVibes(user.email);
            console.log(`[DEBUG] CommonRoomClient: Successfully fetched ${fetchedVibes.length} vibes.`);
            // Sort on the client side
            const sortedVibes = fetchedVibes.sort((a, b) => {
                const timeA = a.lastPostAt ? new Date(a.lastPostAt).getTime() : new Date(a.createdAt).getTime();
                const timeB = b.lastPostAt ? new Date(b.lastPostAt).getTime() : new Date(b.createdAt).getTime();
                return timeB - timeA;
            });
            setVibes(sortedVibes);
        } catch (error: any) {
            console.error('[DEBUG] CommonRoomClient: Error calling getVibes action.', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not fetch Common Rooms.' });
        } finally {
            console.log('[DEBUG] CommonRoomClient: Finished fetching, setting isFetching to false.');
            setIsFetching(false);
        }
    }, [user, toast]);

    useEffect(() => {
        console.log(`[DEBUG] CommonRoomClient: useEffect triggered. Loading: ${loading}, User: ${!!user}`);
        if (!loading && user) {
            fetchVibes();
        }
    }, [loading, user, fetchVibes]);

    const renderVibeList = (vibeList: Vibe[]) => {
        if (vibeList.length === 0) {
            return <p className="text-muted-foreground text-sm">No vibes here yet.</p>;
        }

        return (
            <div className="space-y-3">
                {vibeList.map(vibe => (
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
        );
    };

    const { publicVibes, myVibes } = useMemo(() => {
        const publicVibesList: Vibe[] = [];
        const myVibesList: Vibe[] = [];

        vibes.forEach(vibe => {
            if (vibe.isPublic) {
                publicVibesList.push(vibe);
            }
            if (!vibe.isPublic && (vibe.creatorId === user?.uid || vibe.invitedEmails.includes(user?.email || ''))) {
                 myVibesList.push(vibe);
            }
        });
        return { publicVibes: publicVibesList, myVibes: myVibesList };
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
                    {isFetching ? <LoaderCircle className="animate-spin" /> : renderVibeList(myVibes)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Public Vibes</CardTitle>
                    <CardDescription>Open discussions for everyone in the community.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? <LoaderCircle className="animate-spin" /> : renderVibeList(publicVibes)}
                </CardContent>
            </Card>
        </div>
    )
}
