
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { collection, doc, orderBy, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vibe, VibePost, Participant } from '@/lib/types';
import { ArrowLeft, LoaderCircle, Send, Users, CalendarPlus, UserPlus, UserCheck, UserX, ShieldCheck, ShieldX, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { inviteToVibe, postReply, updateHostStatus } from '@/actions/common-room';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


function InviteDialog({ vibeId, vibeTopic, creatorName, onInviteSent }: { vibeId: string, vibeTopic: string, creatorName: string, onInviteSent: () => void }) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emails, setEmails] = useState('');

    const handleInvite = async (sendEmail: boolean) => {
        const emailList = emails.split(/[, ]+/).map(e => e.trim()).filter(e => e);
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
            const result = await inviteToVibe(vibeId, emailList, vibeTopic, creatorName, user.uid, sendEmail);
            if (result.success) {
                if (sendEmail) {
                    toast({ title: 'Invites Sent!', description: 'The users have been invited to this Vibe via email.' });
                } else {
                    const joinUrl = `${window.location.origin}/join-vibe/${vibeId}?ref=${user.uid}`;
                    navigator.clipboard.writeText(joinUrl);
                    toast({ title: 'Link Copied & Invites Added!', description: 'The invite link is on your clipboard. Users have been added to the invite list.' });
                }
                setIsOpen(false);
                setEmails('');
                onInviteSent();
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
                    <Button onClick={() => handleInvite(false)} variant="secondary" disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Copy Link & Invite
                    </Button>
                    <Button onClick={() => handleInvite(true)} disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Send Email Invites
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
        if (!vibeId) return;

        const postsQuery = query(collection(db, `vibes/${vibeId}/posts`), orderBy('createdAt', 'asc'));
        const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
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

        return () => unsubscribePosts();
    }, [vibeId, toast]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [posts]);

    const handlePostReply = async () => {
        if (!replyContent.trim() || !user || !user.displayName || !user.email) return;
        setIsSubmitting(true);
        try {
            await postReply(vibeId, replyContent, { uid: user.uid, name: user.displayName, email: user.email });
            setReplyContent('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to post reply.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const { presentParticipants, invitedButNotPresent } = useMemo(() => {
        if (!vibeData) return { presentParticipants: [], invitedButNotPresent: [] };
        
        const hostEmails = new Set(vibeData.hostEmails || []);
        
        const emailToDetails = new Map<string, { name: string; isHost: boolean }>();

        // Add hosts first to ensure they are listed as present
        hostEmails.forEach(email => {
            emailToDetails.set(email, { name: email.split('@')[0], isHost: true });
        });
        
        // Add post authors, updating their name if available
        posts.forEach(post => {
            if (post.authorEmail) {
                const existing = emailToDetails.get(post.authorEmail) || { name: '', isHost: false };
                emailToDetails.set(post.authorEmail, { ...existing, name: post.authorName });
            }
        });

        const presentEmails = new Set(emailToDetails.keys());
        
        const presentList = Array.from(presentEmails).map(email => ({
            email,
            name: emailToDetails.get(email)!.name,
            isHost: emailToDetails.get(email)!.isHost
        })).sort((a, b) => {
            if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        
        const invitedList = (vibeData.invitedEmails || []).filter((email: string) => !presentEmails.has(email));

        return { presentParticipants: presentList, invitedButNotPresent: invitedList };
    }, [vibeData, posts]);


    const isCurrentUserHost = useMemo(() => {
        if (!user || !user.email || !vibeData) return false;
        return (vibeData.hostEmails || []).includes(user.email);
    }, [user, vibeData]);

    const handleHostToggle = async (targetEmail: string, shouldBeHost: boolean) => {
        if (!isCurrentUserHost) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only hosts can manage other hosts.' });
            return;
        }

        const result = await updateHostStatus(vibeId, targetEmail, shouldBeHost);
        if (result.success) {
            toast({ title: 'Success', description: `Host status updated for ${targetEmail}.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not update host status.' });
        }
    };


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
                    {isCurrentUserHost && (
                        <Button variant="outline">
                            <CalendarPlus className="mr-2 h-4 w-4" />
                            Plan a Party
                        </Button>
                    )}
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
                                {isCurrentUserHost && (
                                     <InviteDialog 
                                        vibeId={vibeId} 
                                        vibeTopic={vibeData.topic} 
                                        creatorName={user?.displayName || 'A user'}
                                        onInviteSent={() => { /* No-op, react-firebase-hooks handles updates */}}
                                    />
                                )}
                                <Separator />
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm flex items-center gap-2"><UserCheck /> Present ({presentParticipants.length})</h4>
                                    {presentParticipants.map(({ name, email, isHost }) => (
                                        <div key={email} className="flex items-center gap-2 p-2 rounded-md bg-muted group">
                                             <Avatar className="h-8 w-8">
                                                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <span className={`font-medium text-sm flex-1 ${isHost ? 'text-primary' : ''}`}>{name}</span>
                                            {isHost && <Badge variant="secondary">Host</Badge>}

                                            {isCurrentUserHost && email !== vibeData.creatorEmail && (
                                                 <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                                                onClick={() => handleHostToggle(email, !isHost)}
                                                            >
                                                                {isHost ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{isHost ? 'Demote from Host' : 'Promote to Host'}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
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
                                    {(vibeData.hostEmails || []).includes(post.authorEmail) && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <Crown className="h-3 w-3 text-amber-500" />
                                                </TooltipTrigger>
                                                <TooltipContent><p>Host</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
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
