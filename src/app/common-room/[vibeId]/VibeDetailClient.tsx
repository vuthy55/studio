
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { collection, doc, orderBy, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vibe, VibePost } from '@/lib/types';
import { ArrowLeft, LoaderCircle, Send, Users, CalendarPlus, UserPlus, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { inviteToVibe, postReply } from '@/actions/common-room';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';


function InviteDialog({ vibeId, vibeTopic, creatorName }: { vibeId: string, vibeTopic: string, creatorName: string }) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emails, setEmails] = useState('');

    const handleInvite = async () => {
        const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
        if (emailList.length === 0) {
            toast({ variant: 'destructive', title: 'No emails entered' });
            return;
        }
        if (!user) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await inviteToVibe(vibeId, emailList, vibeTopic, creatorName, user.uid);
            if (result.success) {
                toast({ title: 'Invites Sent!', description: 'The users have been invited to this Vibe.' });
                setIsOpen(false);
                setEmails('');
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to send invites.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button><UserPlus className="mr-2 h-4 w-4" /> Invite</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite to "{vibeTopic}"</DialogTitle>
                    <DialogDescription>Enter email addresses separated by commas to invite others to join this Vibe.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="emails-to-invite">Emails</Label>
                    <Textarea 
                        id="emails-to-invite" 
                        value={emails}
                        onChange={(e) => setEmails(e.target.value)}
                        placeholder="friend1@example.com, friend2@example.com"
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleInvite} disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Send Invites
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function VibeDetailClient({ vibeId }: { vibeId: string }) {
    const { user, loading: userLoading } = useUserData();
    const { toast } = useToast();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const [vibeData, vibeLoading, vibeError] = useDocumentData(doc(db, 'vibes', vibeId));
    const [posts, setPosts] = useState<VibePost[]>([]);
    const [postsLoading, setPostsLoading] = useState(true);
    const [replyContent, setReplyContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!user) return;

        const postsQuery = query(collection(db, `vibes/${vibeId}/posts`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
            const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VibePost));
            setPosts(postsData);
            setPostsLoading(false);
        }, (error) => {
            console.error("Error fetching posts:", error);
            if (error.code === 'permission-denied') {
                toast({
                    variant: 'destructive',
                    title: 'Permission Denied',
                    description: 'You do not have access to view posts in this private Vibe.',
                });
            }
            setPostsLoading(false);
        });

        return () => unsubscribe();
    }, [vibeId, user, toast]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [posts]);

    const handlePostReply = async () => {
        if (!replyContent.trim() || !user || !user.displayName) return;
        setIsSubmitting(true);
        try {
            await postReply(vibeId, replyContent, { uid: user.uid, name: user.displayName });
            setReplyContent('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to post reply.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const { presentParticipants, invitedButNotPresent } = React.useMemo(() => {
        if (!vibeData) return { presentParticipants: [], invitedButNotPresent: [] };
        
        const present = new Map<string, {name: string, isHost: boolean}>();

        // Add creator/hosts who have posted
        if (vibeData.hostEmails) {
            vibeData.hostEmails.forEach((email: string) => {
                if (posts.some(p => p.authorName === email)) {
                     present.set(email, { name: email, isHost: true });
                }
            });
        }
        
        // Add post authors
        posts.forEach(post => {
            if (!present.has(post.authorName)) {
                present.set(post.authorName, { name: post.authorName, isHost: vibeData.hostEmails?.includes(post.authorName) });
            }
        });
        
         // Find invited people who haven't posted
        const invited = (vibeData.invitedEmails || []).filter((email: string) => !present.has(email));
        
        const presentList = Array.from(present.values()).sort((a, b) => b.isHost.toString().localeCompare(a.isHost.toString()));
        return { presentParticipants: presentList, invitedButNotPresent: invited };

    }, [vibeData, posts]);


    if (userLoading || vibeLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (vibeError) {
        return <p className="text-destructive">Error loading Vibe: {vibeError.message}</p>
    }

    if (!vibeData) {
        return <p>Vibe not found.</p>
    }
    
    const isHost = user && vibeData.hostEmails?.includes(user.email);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            <header className="p-4 border-b flex justify-between items-start">
                <div>
                    <Button variant="ghost" asChild>
                        <Link href="/common-room">
                            <ArrowLeft className="mr-2 h-4 w-4"/>
                            Back to Common Room
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold mt-2">{vibeData.topic}</h1>
                    <p className="text-sm text-muted-foreground">Started by {vibeData.creatorName}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline">
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Plan a Party
                    </Button>
                    <Sheet>
                        <SheetTrigger asChild>
                             <Button variant="outline">
                                <Users className="mr-2 h-4 w-4" />
                                Participants
                            </Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>Participants ({presentParticipants.length + invitedButNotPresent.length})</SheetTitle>
                                <SheetDescription>
                                    People involved in this Vibe.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="py-4 space-y-4">
                                {isHost && (
                                     <InviteDialog 
                                        vibeId={vibeId} 
                                        vibeTopic={vibeData.topic} 
                                        creatorName={user?.displayName || 'A user'}
                                    />
                                )}
                                <Separator />
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm flex items-center gap-2"><UserCheck /> Present ({presentParticipants.length})</h4>
                                    {presentParticipants.map(({ name, isHost: isVibeHost }) => (
                                        <div key={name} className="flex items-center gap-2 p-2 rounded-md bg-muted">
                                             <Avatar className="h-8 w-8">
                                                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <span className={`font-medium text-sm ${isVibeHost ? 'text-primary' : ''}`}>{name}</span>
                                            {isVibeHost && <Badge variant="secondary">Host</Badge>}
                                        </div>
                                    ))}
                                </div>
                                {invitedButNotPresent.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><UserX/> Invited ({invitedButNotPresent.length})</h4>
                                        {invitedButNotPresent.map((email) => (
                                            <div key={email} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                                <Avatar className="h-8 w-8 opacity-70">
                                                    <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-sm text-muted-foreground">{email}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto p-4 space-y-6">
                {postsLoading ? (
                    <LoaderCircle className="animate-spin mx-auto"/>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="flex items-start gap-4">
                            <Avatar>
                                <AvatarFallback>{post.authorName?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-grow">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">{post.authorName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : ''}
                                    </p>
                                </div>
                                <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <footer className="p-4 border-t bg-background">
                <div className="flex items-start gap-2">
                    <Textarea 
                        placeholder="Type your message here..." 
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        className="flex-grow"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handlePostReply();
                            }
                        }}
                    />
                    <Button onClick={handlePostReply} disabled={isSubmitting || !replyContent.trim()}>
                        <Send className="h-4 w-4"/>
                    </Button>
                </div>
            </footer>
        </div>
    );
}
