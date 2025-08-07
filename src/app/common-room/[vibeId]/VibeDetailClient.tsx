
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { onSnapshot, doc, collection, query, orderBy, Timestamp, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vibe, VibePost, Party, UserProfile, BlockedUser, FriendRequest } from '@/lib/types';
import { ArrowLeft, LoaderCircle, Send, Users, CalendarPlus, UserPlus, UserCheck, UserX, ShieldCheck, ShieldX, Crown, Edit, Trash2, MapPin, Copy, UserMinus, LogOut, MessageSquare, Phone, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { inviteToVibe, postReply, updateHostStatus, planParty, rsvpToMeetup, editMeetup, removeParticipantFromVibe, unblockParticipantFromVibe, leaveVibe, translateVibePost, deleteVibe } from '@/actions/common-room';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { sendFriendRequest } from '@/actions/friends';
import { MeetupDetailsDialog } from '@/app/common-room/MeetupDetailsDialog';
import { languages as allLangs, type LanguageCode } from '@/lib/data';


function PlanPartyDialog({ vibeId }: { vibeId: string }) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [startTime, setStartTime] = useState<Date | undefined>(() => {
        const d = new Date();
        d.setHours(d.getHours() + 1);
        d.setMinutes(0);
        return d;
    });
    const [endTime, setEndTime] = useState<Date | undefined>(() => {
        const d = new Date();
        d.setHours(d.getHours() + 3);
        d.setMinutes(0);
        return d;
    });

    const handlePlanParty = async () => {
        if (!title.trim() || !location.trim() || !startTime || !endTime) {
            toast({ variant: 'destructive', title: 'All fields are required' });
            return;
        }
        if (!user || !user.displayName) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await planParty({
                vibeId,
                title,
                location,
                description,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                creatorId: user.uid,
                creatorName: user.displayName,
            });
            
            if(result.success) {
                toast({ title: 'Meetup Planned!', description: 'Your new event is scheduled.' });
                setIsOpen(false);
                setTitle('');
                setLocation('');
                setDescription('');
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Start a Meetup
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Start a New Meetup</DialogTitle>
                    <DialogDescription>Organize a real-world event for this Vibe's participants.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="party-title">Title</Label>
                        <Input id="party-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Sunset drinks at the beach bar" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="party-location">Location (Google Maps or Waze Link)</Label>
                        <Input id="party-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="party-description">Description (Optional)</Label>
                        <Textarea id="party-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Let's meet at the main entrance at 7pm sharp." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Time</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startTime && "text-muted-foreground")}>
                                        <CalendarPlus className="mr-2 h-4 w-4" />
                                        {startTime ? format(startTime, 'PPp') : 'Select start time'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={startTime} onSelect={setStartTime} />
                                     <div className="p-3 border-t border-border">
                                        <div className="flex items-center gap-2">
                                            <Select
                                                value={startTime ? String(startTime.getHours()).padStart(2, '0') : '00'}
                                                onValueChange={(value) => {
                                                    setStartTime(d => {
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
                                                value={startTime ? String(Math.floor(startTime.getMinutes() / 15) * 15).padStart(2, '0') : '00'}
                                                onValueChange={(value) => {
                                                    setStartTime(d => {
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
                        <div className="space-y-2">
                            <Label>End Time</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endTime && "text-muted-foreground")}>
                                        <CalendarPlus className="mr-2 h-4 w-4" />
                                        {endTime ? format(endTime, 'PPp') : 'Select end time'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={endTime} onSelect={setEndTime} />
                                     <div className="p-3 border-t border-border">
                                        <div className="flex items-center gap-2">
                                            <Select
                                                value={endTime ? String(endTime.getHours()).padStart(2, '0') : '00'}
                                                onValueChange={(value) => {
                                                    setEndTime(d => {
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
                                                value={endTime ? String(Math.floor(endTime.getMinutes() / 15) * 15).padStart(2, '0') : '00'}
                                                onValueChange={(value) => {
                                                    setEndTime(d => {
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
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handlePlanParty} disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                        Plan Meetup
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function InviteDialog({ vibeId, vibeTopic, creatorName }: { vibeId: string, vibeTopic: string, creatorName: string }) {
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
    const { user, userProfile, loading: userLoading } = useUserData();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const router = useRouter();
    
    const [vibeData, setVibeData] = useState<Vibe | undefined>(undefined);
    const [vibeLoading, setVibeLoading] = useState(true);
    const [vibeError, setVibeError] = useState<any>(null);

    const [posts, setPosts] = useState<VibePost[]>([]);
    const [postsLoading, setPostsLoading] = useState(true);
    
    const [activeMeetup, setActiveMeetup] = useState<Party | undefined>(undefined);
    const [activeMeetupLoading, setActiveMeetupLoading] = useState(true);
    const [activeMeetupError, setActiveMeetupError] = useState<any>(null);

    const [translatedPosts, setTranslatedPosts] = useState<Record<string, string>>({});
    const [isTranslatingPost, setIsTranslatingPost] = useState<string | null>(null);

    const fromTab = searchParams.get('from') || 'discover';
    const backLink = fromTab === 'my-space' ? '/common-room?tab=my-space' : '/common-room';

    useEffect(() => {
        const vibeDocRef = doc(db, 'vibes', vibeId);
        const unsubscribeVibe = onSnapshot(vibeDocRef, (doc) => {
            setVibeData(doc.exists() ? { id: doc.id, ...doc.data() } as Vibe : undefined);
            setVibeLoading(false);
        }, (error) => {
            setVibeError(error);
            setVibeLoading(false);
        });

        const postsQuery = query(collection(db, `vibes/${vibeId}/posts`), orderBy('createdAt', 'asc'));
        const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
            const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VibePost));
            setPosts(newPosts);
            
            // Update local state with any existing translations
            const existingTranslations: Record<string, string> = {};
            if (userProfile?.defaultLanguage) {
                const targetLang = allLangs.find(l => l.label.toLowerCase().includes(userProfile.defaultLanguage!.split('-')[0]))?.value;
                if (targetLang) {
                    newPosts.forEach(post => {
                        if (post.translations && post.translations[targetLang]) {
                            existingTranslations[post.id] = post.translations[targetLang];
                        }
                    });
                }
            }
            setTranslatedPosts(prev => ({...prev, ...existingTranslations}));

            setPostsLoading(false);
        }, (error) => {
            if (error.code === 'permission-denied') {
                toast({
                    variant: 'destructive',
                    title: 'Permission Denied',
                    description: 'You do not have access to view posts in this private Vibe.',
                });
            }
            setPostsLoading(false);
        });

        return () => {
            unsubscribeVibe();
            unsubscribePosts();
        };
    }, [vibeId, toast, userProfile?.defaultLanguage]);

    useEffect(() => {
        if (!vibeData) return;

        if (!vibeData.activeMeetupId) {
            setActiveMeetup(undefined);
            setActiveMeetupLoading(false);
            return;
        }

        setActiveMeetupLoading(true);
        const meetupDocRef = doc(db, `vibes/${vibeId}/parties`, vibeData.activeMeetupId);
        
        const unsubscribe = onSnapshot(meetupDocRef, (doc) => {
            if (doc.exists()) {
                 const data = doc.data();
                 setActiveMeetup({
                    id: doc.id,
                    ...data,
                    startTime: (data.startTime as Timestamp)?.toDate().toISOString(),
                    endTime: (data.endTime as Timestamp)?.toDate().toISOString(),
                } as Party);
            } else {
                setActiveMeetup(undefined);
            }
           
            setActiveMeetupLoading(false);
        }, (error) => {
            console.error("Error fetching active meetup:", error);
            setActiveMeetupError(error);
            setActiveMeetupLoading(false);
        });

        return () => unsubscribe();
    }, [vibeId, vibeData]);

    const [replyContent, setReplyContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
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
    
     const { presentParticipants, invitedButNotPresent, allPresentUsersMap, blockedUsersList } = useMemo(() => {
        if (!vibeData) return { presentParticipants: [], invitedButNotPresent: [], allPresentUsersMap: new Map(), blockedUsersList: [] };
    
        const emailToDetails = new Map<string, { uid: string; name: string; isHost: boolean }>();
        const hostEmails = new Set(vibeData.hostEmails || []);
        const blockedUserEmails = new Set((vibeData.blockedUsers || []).map(u => u.email.toLowerCase()));
    
        // The creator is always present
        if (vibeData.creatorEmail && !blockedUserEmails.has(vibeData.creatorEmail.toLowerCase())) {
            emailToDetails.set(vibeData.creatorEmail.toLowerCase(), {
                uid: vibeData.creatorId,
                name: vibeData.creatorName,
                isHost: true // The creator is always a host
            });
        }
    
        // Add participants from posts, ensuring they are not blocked
        posts.forEach(post => {
            if (post.authorEmail && post.authorId !== 'system') {
                const lowerEmail = post.authorEmail.toLowerCase();
                if (!blockedUserEmails.has(lowerEmail)) {
                    if (!emailToDetails.has(lowerEmail)) { // Avoid overwriting creator details
                        emailToDetails.set(lowerEmail, {
                            uid: post.authorId,
                            name: post.authorName,
                            isHost: hostEmails.has(lowerEmail)
                        });
                    }
                }
            }
        });
    
        const presentEmails = new Set(Array.from(emailToDetails.keys()));
    
        const invitedList = (vibeData.invitedEmails || [])
            .map((e: string) => e.toLowerCase())
            .filter((email: string) => !presentEmails.has(email) && !blockedUserEmails.has(email));
        
        const presentList = Array.from(presentEmails).map(email => ({
            email: email,
            ...emailToDetails.get(email)!
        })).sort((a, b) => {
            if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    
        return { 
            presentParticipants: presentList, 
            invitedButNotPresent: invitedList, 
            allPresentUsersMap: emailToDetails, 
            blockedUsersList: vibeData.blockedUsers || [] 
        };
    }, [vibeData, posts]);


    const isCurrentUserHost = useMemo(() => {
        return !!user?.email && !!vibeData?.hostEmails?.includes(user.email);
    }, [user, vibeData]);
    
    const canPlanParty = useMemo(() => {
        if (!vibeData || !user) return false;
        if(vibeData.isPublic) return true;
        return isCurrentUserHost;
    }, [vibeData, user, isCurrentUserHost]);

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
    
     const handleRemoveUser = async (userToRemove: { uid: string, email: string, name: string }) => {
        if (!isCurrentUserHost) return;
        const result = await removeParticipantFromVibe(vibeId, userToRemove);
         if (result.success) {
            toast({ title: 'User Removed', description: `${userToRemove.name} has been removed and blocked from this Vibe.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not remove user.' });
        }
    };
    
    const handleLeaveVibe = async () => {
        if (!user || !user.email) return;
        const result = await leaveVibe(vibeId, user.email);
        if (result.success) {
            toast({ title: 'You have left the Vibe', description: 'You can no longer see or participate in this conversation.' });
            router.push('/common-room');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not leave the Vibe.' });
        }
    };

    const handleCopyInviteLink = (email: string) => {
        if (!user) return;
        const joinUrl = `${window.location.origin}/join-vibe/${vibeId}?ref=${user.uid}`;
        navigator.clipboard.writeText(joinUrl);
        toast({ title: 'Link Copied!', description: `Invite link for ${email} is on your clipboard.` });
    };
    
    const handleRsvp = async (partyId: string, isRsvping: boolean) => {
        if (!user) return;
        const result = await rsvpToMeetup(vibeId, partyId, user.uid, isRsvping);
        if(!result.success) {
            toast({variant: 'destructive', title: 'Error', description: 'Could not update your RSVP status.'});
        }
    }
    
    const handleUnblockUser = async (userToUnblock: BlockedUser) => {
        if (!user?.email) return;
        const result = await unblockParticipantFromVibe(vibeId, user.email, userToUnblock);
        if (result.success) {
            toast({ title: "User Unblocked", description: `${userToUnblock.email} can now rejoin this Vibe.` });
        } else {
             toast({ variant: "destructive", title: "Error", description: result.error || "Could not unblock user." });
        }
    }
    
    const handleSendFriendRequest = async (recipient: { email: string; name: string }) => {
        if (!user || !user.displayName || !user.email) {
            toast({ variant: 'destructive', title: 'Login required', description: 'You must be logged in to send friend requests.' });
            return;
        }
        const result = await sendFriendRequest({ uid: user.uid, name: user.displayName, email: user.email }, recipient.email);
        if (result.success) {
            toast({ title: 'Request Sent!', description: `Friend request sent to ${recipient.name}.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not send friend request.' });
        }
    };

    const handleTranslatePost = async (post: VibePost) => {
        if (!user || !userProfile?.defaultLanguage) return;
        if (translatedPosts[post.id]) return; // Already translated

        setIsTranslatingPost(post.id);
        
        try {
            const result = await translateVibePost({
                postId: post.id,
                vibeId,
                userId: user.uid,
                targetLanguage: userProfile.defaultLanguage
            });

            if (result.translatedText) {
                setTranslatedPosts(prev => ({ ...prev, [post.id]: result.translatedText! }));
            } else if (result.error) {
                toast({ variant: 'destructive', title: 'Translation Failed', description: result.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to translate post.' });
        } finally {
            setIsTranslatingPost(null);
        }
    }
    
    const handleDeleteVibe = async () => {
        if (!user) return;
        const result = await deleteVibe(vibeId, user.uid);
        if (result.success) {
            toast({ title: 'Vibe Deleted', description: 'This vibe and all its posts have been removed.' });
            router.push('/common-room');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    };
    
    if (userLoading || vibeLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
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
                        <Link href={backLink}>
                            <ArrowLeft className="mr-2 h-4 w-4"/>
                            Back to Common Room
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold mt-2">{vibeData.topic}</h1>
                    <p className="text-sm text-muted-foreground">Started by {vibeData.creatorName}</p>
                </div>
                <div className="flex items-center gap-2">
                    {vibeData.activeMeetupId ? (
                        activeMeetupLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <LoaderCircle className="h-5 w-5 animate-spin" />
                            </div>
                        ) : activeMeetup ? (
                             <MeetupDetailsDialog party={activeMeetup}>
                                <Button variant="default">
                                    <CalendarPlus className="mr-2 h-4 w-4 shrink-0" />
                                    Meetup Details
                                </Button>
                            </MeetupDetailsDialog>
                        ) : null
                    ) : (
                        canPlanParty && <PlanPartyDialog vibeId={vibeId} />
                    )}


                    <Sheet>
                        <SheetTrigger asChild>
                             <Button variant="outline">
                                <Users className="mr-2 h-4 w-4" />
                                Participants
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="flex flex-col">
                            <SheetHeader>
                                <SheetTitle>Participants ({presentParticipants.length + invitedButNotPresent.length})</SheetTitle>
                                <SheetDescription>
                                    People involved in this Vibe.
                                </SheetDescription>
                            </SheetHeader>
                            <ScrollArea className="flex-grow">
                            <div className="py-4 space-y-4 pr-4">
                                {isCurrentUserHost && (
                                     <InviteDialog 
                                        vibeId={vibeId} 
                                        vibeTopic={vibeData.topic} 
                                        creatorName={user?.displayName || 'A user'}
                                    />
                                )}
                                <Separator />
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm flex items-center gap-2"><UserCheck /> Present ({presentParticipants.length})</h4>
                                    {presentParticipants.map((p) => {
                                        const isFriend = userProfile?.friends?.includes(p.uid);
                                        const hasPendingRequest = userProfile?.friendRequests?.some(req => req.fromUid === p.uid);

                                        return (
                                        <div key={p.email} className="flex items-center gap-2 p-2 rounded-md bg-muted group">
                                             <Avatar className="h-8 w-8">
                                                <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <span className={`font-medium text-sm flex-1 ${p.isHost ? 'text-primary' : ''}`}>{p.name}</span>
                                            {p.isHost && <Badge variant="secondary">Host</Badge>}

                                             {isCurrentUserHost && user?.uid !== p.uid && (
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7"><MessageSquare className="h-4 w-4" /></Button></TooltipTrigger>
                                                            <TooltipContent><p>Chat with {p.name}</p></TooltipContent>
                                                        </Tooltip>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7"><Phone className="h-4 w-4" /></Button></TooltipTrigger>
                                                            <TooltipContent><p>Start voice call</p></TooltipContent>
                                                        </Tooltip>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleHostToggle(p.email, !p.isHost)}>{p.isHost ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}</Button></TooltipTrigger>
                                                            <TooltipContent><p>{p.isHost ? 'Demote from Host' : 'Promote to Host'}</p></TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <AlertDialog>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <AlertDialogTrigger asChild><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"><UserMinus className="h-4 w-4" /></Button></TooltipTrigger></AlertDialogTrigger>
                                                                <TooltipContent>Remove user</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Remove {p.name}?</AlertDialogTitle>
                                                                <AlertDialogDescription>This will permanently remove and block {p.name} from this Vibe. They will not be able to rejoin unless unblocked by a host.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleRemoveUser(p)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Remove & Block</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            )}

                                            {user?.uid !== p.uid && !isFriend && !hasPendingRequest && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleSendFriendRequest(p)}>
                                                                <UserPlus className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Add Friend</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    )})}
                                </div>
                                {invitedButNotPresent.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><UserX/> Invited ({invitedButNotPresent.length})</h4>
                                        {invitedButNotPresent.map((email) => (
                                            <div key={email} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group">
                                                <Avatar className="h-8 w-8 opacity-70">
                                                    <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-sm text-muted-foreground flex-1 truncate">{email}</span>
                                                 {isCurrentUserHost && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                                                    onClick={() => handleCopyInviteLink(email)}
                                                                >
                                                                    <Copy className="h-4 w-4 text-primary" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Copy Invite Link</p></TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {isCurrentUserHost && blockedUsersList.length > 0 && (
                                     <div className="space-y-2 pt-2 border-t">
                                        <h4 className="font-semibold text-sm flex items-center gap-2 text-destructive"><UserMinus/> Blocked ({blockedUsersList.length})</h4>
                                        {blockedUsersList.map((blockedUser) => (
                                            <div key={blockedUser.uid} className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 group">
                                                <span className="font-medium text-sm text-destructive flex-1 truncate">{blockedUser.email}</span>
                                                <Button size="sm" variant="outline" onClick={() => handleUnblockUser(blockedUser)}>Re-admit</Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            </ScrollArea>
                            <div className="mt-auto border-t pt-4 space-y-2">
                                {user?.uid === vibeData.creatorId ? (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full">
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete Vibe
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete this Vibe?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete "{vibeData.topic}" and all of its posts. This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteVibe} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                    Confirm & Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                ) : (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full">
                                                <LogOut className="mr-2 h-4 w-4" /> Leave Vibe
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    You will no longer be able to see this Vibe or its messages. You can be re-invited by a host later.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleLeaveVibe} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                    Confirm & Leave
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
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
                    posts.map(post => {
                        if (post.type === 'meetup_announcement' && post.meetupDetails && activeMeetup) {
                            const isUserRsvpdInPost = user && activeMeetup?.rsvps?.includes(user.uid);
                            return (
                                <Card key={post.id} className="my-4 border-primary/50 bg-primary/10">
                                    <CardContent className="p-4 text-center space-y-2">
                                        <p className="text-sm text-primary/80">{post.content}</p>
                                        <h4 className="font-bold text-lg text-primary">{post.meetupDetails.title}</h4>
                                        <p className="text-sm">
                                            {format(new Date(post.meetupDetails.startTime), 'MMM d, h:mm a')}
                                        </p>
                                        <Button size="sm" variant={isUserRsvpdInPost ? 'secondary' : 'default'} onClick={() => handleRsvp(activeMeetup!.id, !isUserRsvpdInPost)}>
                                            {isUserRsvpdInPost ? `I'm Out (${activeMeetup.rsvps?.length})` : `I'm In (${activeMeetup.rsvps?.length})`}
                                        </Button>
                                    </CardContent>
                                </Card>
                            )
                        }
                         if (post.type === 'system_message') {
                            return (
                                <div key={post.id} className="text-center text-xs text-muted-foreground italic py-2">
                                    {post.content} - {post.createdAt ? formatDistanceToNow((post.createdAt as Timestamp).toDate(), { addSuffix: true }) : ''}
                                </div>
                            )
                        }
                        return (
                            <div key={post.id} className="flex items-start gap-4 group">
                                <Avatar>
                                    <AvatarFallback>{post.authorName?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold">{post.authorName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {post.createdAt ? formatDistanceToNow((post.createdAt as Timestamp).toDate(), { addSuffix: true }) : ''}
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
                                    {translatedPosts[post.id] && (
                                        <div className="mt-2 p-2 border-l-2 border-primary bg-muted/50 rounded-r-md">
                                            <p className="text-sm text-muted-foreground">{translatedPosts[post.id]}</p>
                                        </div>
                                    )}
                                </div>
                                {user?.uid !== post.authorId && (
                                    <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => handleTranslatePost(post)} disabled={!!isTranslatingPost || !!translatedPosts[post.id]}>
                                        {isTranslatingPost === post.id ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Languages className="h-4 w-4"/>}
                                    </Button>
                                )}
                            </div>
                        )
                    })
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
