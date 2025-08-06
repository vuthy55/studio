
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUserData } from '@/context/UserDataContext';
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Bell, RefreshCw, ChevronRight, HelpCircle, Phone, Copy, UserMinus, UserCheck, ShieldCheck, ShieldX, XCircle, Crown, Edit, Trash2, CalendarPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, getUpcomingPublicParties, getAllMyUpcomingParties, rsvpToMeetup, updateHostStatus, removeParticipantFromVibe, editMeetup } from '@/actions/common-room';
import { ClientVibe, ClientParty, UserProfile, Vibe, Party } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { notificationSound } from '@/lib/sounds';
import { useTour, TourStep } from '@/context/TourContext';
import MainHeader from '@/components/layout/MainHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { onSnapshot, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendFriendRequest } from '@/actions/friends';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Textarea } from '../ui/textarea';


const commonRoomTourSteps: TourStep[] = [
  {
    selector: '[data-tour="cr-discover-tab"]',
    content: "The 'Discover' tab is where you can find all public meetups and ongoing conversations (called 'Vibes').",
  },
  {
    selector: '[data-tour="cr-my-space-tab"]',
    content: "The 'My Space' tab shows all the Vibes you've created or been invited to, along with meetups happening within them.",
  },
  {
    selector: '[data-tour="cr-start-vibe-button"]',
    content: "Ready to start your own conversation? Click here to create a new Vibe.",
    position: 'bottom',
  },
];

function MeetupDetailsDialog({ party, children }: { party: ClientParty, children: React.ReactNode }) {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [editableMeetup, setEditableMeetup] = useState<Partial<Party>>({});
    const [vibeData, setVibeData] = useState<Vibe | null>(null);

    const [attendees, setAttendees] = useState<UserProfile[]>([]);
    const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);

    useEffect(() => {
        setEditableMeetup(party);
    }, [party]);
    
    useEffect(() => {
        if (!isOpen) return;
        
        const vibeDocRef = doc(db, 'vibes', party.vibeId);
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
    }, [party.vibeId, isOpen, party.rsvps, toast]);

    const isCurrentUserHost = useMemo(() => {
        if (!user || !vibeData) return false;
        return (vibeData as Vibe)?.hostEmails?.includes(user.email!);
    }, [user, vibeData]);
    
    const handleHostToggle = async (targetEmail: string, shouldBeHost: boolean) => {
        if (!isCurrentUserHost) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only hosts can manage other hosts.' });
            return;
        }

        const result = await updateHostStatus(party.vibeId, targetEmail, shouldBeHost);
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
        const result = await removeParticipantFromVibe(party.vibeId, { uid, email: userToRemove.email });
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

            const result = await editMeetup(party.vibeId, party.id, payload, user.displayName);

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
        const result = await rsvpToMeetup(party.vibeId, partyId, user.uid, isRsvping);
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
            {children}
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
                <DialogFooter className="sm:justify-between gap-2">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreateVibeDialog({ onVibeCreated, children, variant = "default" }: { onVibeCreated: () => void, children: React.ReactNode, variant?: "default" | "primary" }) {
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
            {children}
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
    );
}

function PartyList({ parties, title, onSortByDistance, onSortByDate, sortMode, isCalculatingDistance, locationStatus, debugLog }: { parties: ClientParty[], title: string, onSortByDistance: () => void, onSortByDate: () => void, sortMode: 'date' | 'distance', isCalculatingDistance: boolean, locationStatus: 'idle' | 'loading' | 'success' | 'error', debugLog: string[] }) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-xl">{title}</h3>
                 <div className="flex items-center gap-2">
                    {sortMode === 'distance' ? (
                        <Button variant="outline" size="sm" onClick={onSortByDate}><Calendar className="mr-2"/> Sort by Date</Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={onSortByDistance} disabled={isCalculatingDistance}>
                            {isCalculatingDistance ? <LoaderCircle className="h-4 w-4 animate-spin mr-2"/> : <LocateFixed className="h-4 w-4 mr-2" />}
                            Parties Near Me
                        </Button>
                    )}
                </div>
            </div>
            {locationStatus === 'loading' && (
                <div className="text-sm text-muted-foreground text-center py-4">Requesting your location...</div>
            )}
            {locationStatus === 'success' && sortMode === 'distance' && (
                 <div className="text-sm text-muted-foreground text-center py-2 bg-muted rounded-md">Sorting meetups by your location.</div>
            )}
             {parties.length === 0 ? (
                 <div className="text-muted-foreground text-sm text-center py-8 space-y-2">
                    <p className="font-semibold">No upcoming meetups found.</p>
                    <p>To plan one, start a Vibe and use the "Start a Meetup" button inside it.</p>
                </div>
            ) : (
                parties.map(party => (
                    <MeetupDetailsDialog key={party.id} party={party}>
                        <DialogTrigger asChild>
                            <Card className="hover:border-primary/50 transition-colors cursor-pointer text-left">
                                <CardContent className="p-4 space-y-2">
                                    {typeof party.distance === 'number' && (
                                        <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                                    )}
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <h4 className="font-semibold">{party.title}</h4>
                                            <p className="text-sm text-muted-foreground">
                                                From Vibe: <Link href={`/common-room/${party.vibeId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{party.vibeTopic}</Link>
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-semibold text-sm">{format(new Date(party.startTime), 'MMM d')}</p>
                                            <p className="text-xs text-muted-foreground">{format(new Date(party.startTime), 'h:mm a')}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground pt-2 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4" />
                                            <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                View Location <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                        {party.description && (
                                            <p className="text-xs text-muted-foreground truncate pt-1">{party.description}</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                         </DialogTrigger>
                    </MeetupDetailsDialog>
                ))
            )}
        </div>
    );
}

/**
 * Calculates the distance between two lat/lon points in kilometers using the Haversine formula.
 */
function calculateDistance(startCoords: { lat: number; lon: number }, destCoords: { lat: number; lon: number }): number {
    const R = 6371; // Earth's radius in km
    const dLat = (destCoords.lat - startCoords.lat) * (Math.PI / 180);
    const dLon = (destCoords.lon - startCoords.lon) * (Math.PI / 180);
    const lat1 = startCoords.lat * (Math.PI / 180);
    const lat2 = destCoords.lat * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

type ActiveContentView = 'public-meetups' | 'public-vibes' | 'my-meetups' | 'my-vibes';

export default function CommonRoomClient() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const { startTour } = useTour();
    const [allVibes, setAllVibes] = useState<ClientVibe[]>([]);
    const [publicParties, setPublicParties] = useState<ClientParty[]>([]);
    const [myParties, setMyParties] = useState<ClientParty[]>([]);
    
    const [isFetching, setIsFetching] = useState(true);
    const [activeTab, setActiveTab] = useState<ActiveContentView>('public-meetups');
    
    const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setAllVibes([]);
            setPublicParties([]);
            setMyParties([]);
            setIsFetching(false);
            return;
        }
        setIsFetching(true);
        try {
            const [fetchedVibes, fetchedPublicParties, fetchedMyParties] = await Promise.all([
                getVibes(user.email),
                getUpcomingPublicParties(),
                getAllMyUpcomingParties(user.email),
            ]);
            setAllVibes(fetchedVibes);
            setPublicParties(fetchedPublicParties);
            setMyParties(fetchedMyParties);
            setSortMode('date');
        } catch (error: any) {
            console.error("Error fetching common room data:", error);
            toast({ variant: 'destructive', title: 'Error fetching data', description: error.message || 'An unknown error occurred' });
        } finally {
            setIsFetching(false);
        }
    }, [user, toast]);
    
    useEffect(() => {
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio(notificationSound);
        }
    }, []);
    
    const extractCoordsFromUrl = useCallback(async (url: string): Promise<{ lat: number; lon: number } | null> => {
        if (!url) return null;
        let finalUrl = url;
        
        if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
            try {
                const result = await resolveUrlAction(url);
                if (result.success && result.finalUrl) {
                    finalUrl = result.finalUrl;
                }
            } catch (error) {
                 console.error("Could not resolve shortened URL:", url, error);
            }
        }
    
        const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
        const match = finalUrl.match(regex);
    
        if (match) {
            const lat = parseFloat(match[1]);
            const lon = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lon)) {
                return { lat, lon };
            }
        }
        
        return null;
    }, []);

    const processPartiesWithLocation = useCallback(async (location: { lat: number, lon: number }, targetParties: ClientParty[], setParties: React.Dispatch<React.SetStateAction<ClientParty[]>>) => {
        setIsProcessingLocation(true);
        try {
            const partiesWithDistance = await Promise.all(targetParties.map(async (party) => {
                const coords = await extractCoordsFromUrl(party.location);
                let distance;
                if (coords) {
                    distance = calculateDistance(location, coords);
                }
                return { ...party, distance };
            }));

            partiesWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
            setParties(partiesWithDistance);
            setSortMode('distance');
            setLocationStatus('success');
        } catch (error) {
            console.error("Error processing parties with location:", error);
            toast({ variant: 'destructive', title: 'Calculation Error', description: 'Could not calculate distances for meetups.' });
            setLocationStatus('error');
        } finally {
            setIsProcessingLocation(false);
        }
    }, [extractCoordsFromUrl, toast]);


    const handleSortByDistance = () => {
        setLocationStatus('loading');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lon: position.coords.longitude };
                processPartiesWithLocation(loc, publicParties, setPublicParties);
                processPartiesWithLocation(loc, myParties, setMyParties);
            },
            (error) => {
                toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services in your browser.' });
                setLocationStatus('error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
        );
    };

    const handleSortByDate = () => {
        setPublicParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
        setMyParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
        setSortMode('date');
        setLocationStatus('idle');
    };


    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);
    

    const { publicVibes } = useMemo(() => {
        const publicV = allVibes.filter(v => v.isPublic);
        return { publicVibes: publicV };
    }, [allVibes]);

    return (
        <div className="space-y-6">
            <MainHeader title="The Common Room" description="Share stories, ask questions, and connect with fellow travelers.">
                 <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => startTour(commonRoomTourSteps)}>
                        <HelpCircle className="mr-2 h-4 w-4"/>
                        <span className="hidden md:inline">Take a Tour</span>
                    </Button>
                </div>
            </MainHeader>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-start gap-2">
                         <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveContentView)}>
                            <TabsList className="grid w-full grid-cols-5 h-auto">
                                <CreateVibeDialog onVibeCreated={fetchData}>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <DialogTrigger asChild>
                                                <TooltipTrigger asChild>
                                                    <Button variant="default" className="w-full h-full flex flex-col items-center justify-center gap-1 py-2 rounded-r-none md:flex-row md:gap-2 data-[state=active]:bg-primary">
                                                        <PlusCircle className="h-5 w-5" />
                                                        <span className="hidden md:inline">Start a Vibe</span>
                                                    </Button>
                                                </TooltipTrigger>
                                            </DialogTrigger>
                                            <TooltipContent className="md:hidden">Start a Vibe</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </CreateVibeDialog>
                                <TabsTrigger value="public-meetups" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><Compass className="h-5 w-5" /><span className="hidden md:inline">Public Meetups</span></TabsTrigger>
                                <TabsTrigger value="public-vibes" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><MessageSquare className="h-5 w-5" /><span className="hidden md:inline">Public Vibes</span></TabsTrigger>
                                <TabsTrigger value="my-meetups" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><Calendar className="h-5 w-5" /><span className="hidden md:inline">My Meetups</span></TabsTrigger>
                                <TabsTrigger value="my-vibes" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><UserCircle className="h-5 w-5" /><span className="hidden md:inline">My Vibes</span></TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent>
                    {isFetching ? (
                        <div className="flex justify-center items-center py-8">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="pt-4">
                            {activeTab === 'public-meetups' && <PartyList parties={publicParties} title="Public Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} debugLog={[]} />}
                            {activeTab === 'public-vibes' && <VibeList vibes={publicVibes} parties={publicParties} title="Public Vibes" source="discover" />}
                            {activeTab === 'my-meetups' && <PartyList parties={myParties} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} debugLog={[]} />}
                            {activeTab === 'my-vibes' && <VibeList vibes={allVibes} parties={myParties} title="My Vibes & Invites" source="my-space" />}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function VibeList({ vibes, parties, title, source }: { vibes: ClientVibe[], parties: ClientParty[], title: string, source: 'discover' | 'my-space' }) {
    
    const getActiveMeetup = (vibe: ClientVibe) => {
        return parties.find(p => p.vibeId === vibe.id);
    }
    
    return (
        <div className="space-y-4">
            <h3 className="font-bold text-xl">{title}</h3>
            {vibes.length === 0 ? (
                <div className="text-muted-foreground text-sm text-center py-8">
                    <p>No vibes found here.</p>
                </div>
            ) : (
                 <div className="border rounded-lg">
                    {vibes.map((vibe, index) => {
                        const activeMeetup = getActiveMeetup(vibe);
                        return (
                            <Link href={`/common-room/${vibe.id}?from=${source}`} key={vibe.id} className="block">
                                <div className={`flex items-center p-4 hover:bg-muted/50 transition-colors ${index < vibes.length - 1 ? 'border-b' : ''}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{vibe.topic}</p>
                                            {activeMeetup && <Badge variant="secondary">[Meetup]</Badge>}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {vibe.postsCount} posts
                                            {vibe.lastPostAt && (
                                                <> &middot; Last post {formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })}</>
                                            )}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground"/>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
