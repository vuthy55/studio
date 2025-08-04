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
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare, ShieldCheck, XCircle, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw, Calendar as CalendarIcon, Users, Link as LinkIcon, Send, HelpCircle, MessageSquare } from 'lucide-react';
import { Vibe } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, inviteToVibe, ClientVibe } from '@/actions/common-room';
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


export default function CommonRoomClient() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const [vibes, setVibes] = useState<ClientVibe[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const fetchVibes = useCallback(async () => {
        if (!user || !user.email) {
            setVibes([]);
            return;
        }
        setIsFetching(true);
        try {
            const fetchedVibes = await getVibes(user.email);
            setVibes(fetchedVibes);
        } catch (error) {
            console.error("Error fetching vibes:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch common rooms.' });
        } finally {
            setIsFetching(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (!loading && user) {
            fetchVibes();
        } else if (!loading && !user) {
            setIsFetching(false);
        }
    }, [loading, user, fetchVibes]);

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <CreateVibeDialog onVibeCreated={fetchVibes} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Welcome to the Common Room</CardTitle>
                    <CardDescription>
                        This is a place to connect with other travelers. Start a vibe or join an existing discussion.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? (
                        <div className="flex justify-center items-center py-8">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : vibes.length > 0 ? (
                        <div className="space-y-4">
                            {vibes.map(vibe => (
                                <Link key={vibe.id} href={`/common-room/${vibe.id}`} className="block">
                                    <Card className="hover:border-primary transition-colors">
                                        <CardContent className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-semibold text-lg">{vibe.topic}</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        Started by {vibe.creatorName}
                                                    </p>
                                                </div>
                                                <Badge variant={vibe.isPublic ? 'secondary' : 'default'}>
                                                    {vibe.isPublic ? 'Public' : 'Private'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
                                                <div className="flex items-center gap-1">
                                                    <MessageSquare className="h-3 w-3" />
                                                    <span>{vibe.postsCount} posts</span>
                                                </div>
                                                <span>
                                                    {vibe.lastPostAt ? `Last post ${formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(vibe.createdAt), { addSuffix: true })}`}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    ) : (
                         <p className="text-muted-foreground text-sm text-center py-8">
                            No vibes found. Why not start one?
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
