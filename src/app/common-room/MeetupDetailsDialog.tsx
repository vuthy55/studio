
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { onSnapshot, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vibe, Party, UserProfile, BlockedUser, FriendRequest, ClientParty } from '@/lib/types';
import { LoaderCircle, UserPlus, ShieldCheck, ShieldX, UserMinus, MessageSquare, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { inviteToVibe, postReply, updateHostStatus, planParty, rsvpToMeetup, editMeetup, removeParticipantFromVibe, unblockParticipantFromVibe, leaveVibe } from '@/actions/common-room';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserData } from '@/context/UserDataContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { sendFriendRequest } from '@/actions/friends';
import { cn } from '@/lib/utils';
import { MapPin } from 'lucide-react';

export function MeetupDetailsDialog({ party, children }: { party: ClientParty, children: React.ReactNode }) {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [editableMeetup, setEditableMeetup] = useState<Partial<Party>>({});
    const [vibeData, setVibeData] = useState<Vibe | null>(null);

    const [attendees, setAttendees] = useState<UserProfile[]>([]);
    const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
    
    const vibeId = party.vibeId;

    useEffect(() => {
        setEditableMeetup(party);
    }, [party]);
    
    useEffect(() => {
        if (!isOpen || !vibeId) return;
        
        const vibeDocRef = doc(db, 'vibes', vibeId);
        const unsubscribe = onSnapshot(vibeDocRef, (doc) => {
            setVibeData(doc.exists() ? { id: doc.id, ...doc.data() } as Vibe : null);
        });
        
        const fetchAttendees = async () => {
            if (!party.rsvps || party.rsvps.length === 0) {
                setAttendees([]);
                return;
            }
            setIsLoadingAttendees(true);
            try {
                const userIds = party.rsvps;
                const usersRef = collection(db, 'users');
                const chunks = [];
                for (let i = 0; i < userIds.length; i += 30) {
                    chunks.push(userIds.slice(i, i + 30));
                }
                const attendeesData: UserProfile[] = [];
                for (const chunk of chunks) {
                    const q = query(usersRef, where('__name__', 'in', chunk));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(doc => attendeesData.push({ id: doc.id, ...doc.data() } as UserProfile));
                }
                setAttendees(attendeesData);
            } catch (error) {
                console.error("Error fetching attendees:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load attendee list.' });
            } finally {
                setIsLoadingAttendees(false);
            }
        };

        fetchAttendees();
        
        return () => unsubscribe();
    }, [vibeId, isOpen, party.rsvps, toast]);

    const isCurrentUserHost = useMemo(() => {
        if (!user || !vibeData) return false;
        return (vibeData as Vibe)?.hostEmails?.includes(user.email!);
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
    
    const handleRemoveUser = async (userToRemove: { id?: string, uid?: string, email: string, name: string }) => {
        if (!isCurrentUserHost) return;
        const uid = userToRemove.uid || userToRemove.id;
        if (!uid) {
             toast({ variant: 'destructive', title: 'Error', description: 'User ID not found.' });
             return;
        }
        const result = await removeParticipantFromVibe(vibeId, { uid, email: userToRemove.email });
         if (result.success) {
            toast({ title: 'User Removed', description: `${userToRemove.name} has been removed and blocked from this Vibe.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not remove user.' });
        }
    };

    const handleEdit = async () => {
        if (!user || !user.displayName) return;
        setIsSubmitting(true);
        
        try {
            const payload = {
                ...editableMeetup,
                startTime: editableMeetup.startTime ? new Date(editableMeetup.startTime).toISOString() : undefined,
                endTime: editableMeetup.endTime ? new Date(editableMeetup.endTime).toISOString() : undefined,
            };

            const result = await editMeetup(vibeId, party.id, payload, user.displayName);

            if (result.success) {
                toast({ title: 'Meetup Updated', description: 'Changes have been saved and announced in the chat.' });
                setIsEditing(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update meetup.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRsvp = async (partyId: string, isRsvping: boolean) => {
        if (!user) return;
        const result = await rsvpToMeetup(vibeId, partyId, user.uid, isRsvping);
        if(!result.success) {
            toast({variant: 'destructive', title: 'Error', description: 'Could not update your RSVP status.'});
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
    
    const isUserRsvpd = user && party.rsvps?.includes(user.uid);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    {isEditing ? (
                        <Input value={editableMeetup.title} onChange={(e) => setEditableMeetup(p => ({...p, title: e.target.value}))} className="text-lg font-semibold" />
                    ) : (
                        <DialogTitle>{party.title}</DialogTitle>
                    )}
                    <DialogDescription>
                         {isEditing ? (
                            <Input value={editableMeetup.location} onChange={(e) => setEditableMeetup(p => ({...p, location: e.target.value}))} />
                         ) : (
                            <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                                <MapPin className="h-4 w-4" /> Location
                            </a>
                         )}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                    {isEditing ? (
                         <Textarea placeholder="Event details and instructions..." value={editableMeetup.description} onChange={(e) => setEditableMeetup(p => ({...p, description: e.target.value}))} className="text-sm" />
                    ) : (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{party.description || 'No description provided.'}</p>
                    )}
                </div>
                <ScrollArea className="h-48 my-4">
                    <div className="pr-4">
                        <h4 className="font-semibold mb-2">Attendees ({party.rsvps?.length || 0})</h4>
                        {isLoadingAttendees ? (
                            <div className="flex justify-center items-center">
                                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : attendees.length > 0 ? (
                            <div className="space-y-2">
                                {attendees.map(attendee => {
                                    const isHost = vibeData?.hostEmails?.includes(attendee.email);
                                    const isFriend = userProfile?.friends?.includes(attendee.id!);
                                    const hasPendingRequest = userProfile?.friendRequests?.some(req => req.fromUid === attendee.id);

                                    return (
                                    <div key={attendee.id} className="flex items-center gap-2 group">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>{attendee.name.charAt(0).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <span className={cn("text-sm font-medium flex-1", isHost && "text-primary")}>{attendee.name}</span>
                                        {isHost && <Badge variant="secondary">Host</Badge>}

                                        {isCurrentUserHost && user?.uid !== attendee.id && (
                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7"><MessageSquare className="h-4 w-4" /></Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Chat with {attendee.name}</p></TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7"><Phone className="h-4 w-4" /></Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Start voice call</p></TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-7 w-7"
                                                                onClick={() => handleHostToggle(attendee.email, !isHost)}
                                                            >
                                                                {isHost ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{isHost ? 'Demote from Host' : 'Promote to Host'}</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <AlertDialog>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <AlertDialogTrigger asChild>
                                                                <TooltipTrigger asChild>
                                                                     <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                                                                        <UserMinus className="h-4 w-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                            </AlertDialogTrigger>
                                                            <TooltipContent>Remove user</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Remove {attendee.name}?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently remove and block {attendee.name} from this Vibe. They will not be able to rejoin unless unblocked by a host.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleRemoveUser(attendee)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                                Remove & Block
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        )}
                                        {user?.uid !== attendee.id && !isFriend && !hasPendingRequest && (
                                            <TooltipProvider>
                                                 <Tooltip>
                                                    <TooltipTrigger asChild>
                                                         <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleSendFriendRequest(attendee)}>
                                                            <UserPlus className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Add Friend</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No one has RSVP'd yet.</p>
                        )}
                    </div>
                </ScrollArea>
                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                    {isEditing ? (
                         <>
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleEdit} disabled={isSubmitting}>
                                {isSubmitting ? <LoaderCircle className="animate-spin mr-2" /> : null} Save Changes
                            </Button>
                        </>
                    ) : (
                        <>
                             {isCurrentUserHost && <Button variant="secondary" onClick={() => setIsEditing(true)}>Edit</Button>}
                             <Button onClick={() => handleRsvp(party.id, !isUserRsvpd)} variant={isUserRsvpd ? 'secondary' : 'default'} className="flex-1">
                                {isUserRsvpd ? `I'm Out (${party.rsvps?.length || 0})` : `I'm In! (${party.rsvps?.length || 0})`}
                             </Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
