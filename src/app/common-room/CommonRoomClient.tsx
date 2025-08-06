
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar as CalendarIcon, Users as UsersIcon, LocateFixed, HelpCircle, Eye, ChevronRight, Lock, UserPlus, UserCheck, UserX, Crown, Edit, Trash2, CalendarPlus, Copy, UserMinus, LogOut, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMyVibes, startVibe, getUpcomingPublicParties, getAllMyUpcomingParties, rsvpToMeetup, editMeetup, removeRsvp, startPrivateVibe } from '@/actions/common-room';
import { ClientVibe, ClientParty, UserProfile, BlockedUser, Vibe, Party } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTour, TourStep } from '@/context/TourContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onSnapshot, doc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { sendFriendRequest } from '@/actions/friends';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const commonRoomTourSteps: TourStep[] = [
  {
    selector: '[data-tour="cr-start-vibe-button"]',
    content: "Start by creating a Vibe. It can be public for everyone to see, or private for just you and your friends.",
    position: 'bottom',
  },
  {
    selector: '[data-tour="cr-public-vibes-tab"]',
    content: "This tab shows all public discussions. Jump into any Vibe to chat with other travelers.",
  },
  {
    selector: '[data-tour="cr-public-meetups-tab"]',
    content: "Discover public meetups happening around you. Click 'Parties Near Me' to find events closest to your current location.",
  },
  {
    selector: '[data-tour="cr-my-vibes-tab"]',
    content: "This is your personal space, listing all public Vibes you've joined and any private ones you've been invited to.",
  },
  {
    selector: '[data-tour="cr-my-meetups-tab"]',
    content: "This is your personal agenda, showing all the meetups you've RSVP'd to, both public and private.",
  },
];


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
                <Button data-tour="cr-start-vibe-button">
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

function PartyList({ parties, title, onSortByDistance, sortMode, isCalculatingDistance, locationStatus, onSelectParty, tourId }: { parties: ClientParty[], title: string, onSortByDistance: (enabled: boolean) => void, sortMode: 'date' | 'distance', isCalculatingDistance: boolean, locationStatus: 'idle' | 'loading' | 'success' | 'error', onSelectParty: (party: ClientParty) => void, tourId?: string }) {
    return (
        <div className="space-y-4" data-tour={tourId}>
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-xl">{title}</h3>
                 <div className="flex items-center gap-2">
                    {sortMode === 'distance' ? (
                        <Button variant="outline" size="sm" onClick={() => onSortByDistance(false)}><CalendarIcon className="mr-2"/> Sort by Date</Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => onSortByDistance(true)} disabled={isCalculatingDistance}>
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
                </div>
            ) : (
                 <div className="border rounded-lg">
                    {parties.map((party, index) => (
                         <div key={party.id} className={`p-4 ${index < parties.length - 1 ? 'border-b' : ''}`}>
                             <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button onClick={() => onSelectParty(party)} className="text-left font-semibold hover:underline">
                                                        {party.title}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Click to view details and RSVP</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        {!party.isPublic && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1"/>Private</Badge>}
                                        {typeof party.distance === 'number' && (
                                            <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        In Vibe: <Link href={`/common-room/${party.vibeId}?tab=my-vibes`} className="text-primary hover:underline">{party.vibeTopic}</Link>
                                    </p>
                                </div>
                                 <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground ml-4">
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4" />
                                        <span>{format(new Date(party.startTime), 'MMM d, h:mm a')}</span>
                                    </div>
                                    <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                        <MapPin className="h-4 w-4" /> View Map
                                    </a>
                                </div>
                             </div>
                         </div>
                    ))}
                 </div>
            )}
        </div>
    );
}

function VibeList({ vibes, title, tourId, onVibeClick }: { vibes: ClientVibe[], title: string, tourId?: string, onVibeClick: (vibeId: string, currentTab: string) => void }) {
    const searchParams = useSearchParams();
    const currentTab = searchParams.get('tab') || 'public-vibes';
    
    return (
        <div className="space-y-4" data-tour={tourId}>
            <h3 className="font-bold text-xl">{title}</h3>
            {vibes.length === 0 ? (
                <div className="text-muted-foreground text-sm text-center py-8">
                    <p>No vibes found here.</p>
                </div>
            ) : (
                 <div className="border rounded-lg">
                    {vibes.map((vibe, index) => {
                        const isPrivate = !vibe.isPublic;
                        return (
                             <div key={vibe.id} className={`flex items-center p-4 hover:bg-muted/50 transition-colors ${index < vibes.length - 1 ? 'border-b' : ''}`}>
                                <div className="flex-1 cursor-pointer" onClick={() => onVibeClick(vibe.id, currentTab)}>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold">{vibe.topic}</p>
                                        {isPrivate && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1"/>Private</Badge>}
                                        {vibe.activeMeetupId && <Badge variant="outline">[Meetup]</Badge>}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {vibe.postsCount} posts
                                        {vibe.lastPostAt && (
                                            <> &middot; Last post {formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })}</>
                                        )}
                                    </p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => onVibeClick(vibe.id, currentTab)}>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground"/>
                                </Button>
                            </div>
                        )
                    })}
                </div>
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

// A stable callback hook to prevent function re-creation on re-renders
const useStableCallback = <T extends (...args: any[]) => any>(callback: T): T => {
    const callbackRef = useRef<T>(callback);
    
    useEffect(() => {
        callbackRef.current = callback;
    });

    return useMemo(() => ((...args) => callbackRef.current(...args)) as T, []);
};


export default function CommonRoomClient() {
    const { user, userProfile, loading } = useUserData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { startTour } = useTour();
    
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'public-vibes');
    
    // Data states
    const [allVibes, setAllVibes] = useState<ClientVibe[]>([]);
    const [publicParties, setPublicParties] = useState<ClientParty[]>([]);
    const [myParties, setMyParties] = useState<ClientParty[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    
    // Location & Sorting states
    const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);
    const [isLocationLoading, setIsLocationLoading] = useState(false);
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    
    const [selectedParty, setSelectedParty] = useState<ClientParty | null>(null);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        router.push(`/common-room?tab=${value}`, { scroll: false });
    };

    const handleVibeClick = (vibeId: string, currentTab: string) => {
        router.push(`/common-room/${vibeId}?tab=${currentTab}`);
    };

    const fetchData = useStableCallback(async () => {
        if (!user || !user.email) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        console.log("[CLIENT_DEBUG] fetchData called");
        try {
            const [
                fetchedMyVibes,
                fetchedPublicParties,
                fetchedMyParties
            ] = await Promise.all([
                getMyVibes(user.email),
                getUpcomingPublicParties(),
                getAllMyUpcomingParties(user.uid),
            ]);
            
            console.log(`[CLIENT_DEBUG] Fetched My Vibes: ${fetchedMyVibes.length}`);
            console.log(`[CLIENT_DEBUG] Fetched Public Parties: ${fetchedPublicParties.length}`);
            console.log(`[CLIENT_DEBUG] Fetched My Parties: ${fetchedMyParties.length}`);

            setAllVibes(fetchedMyVibes);
            setPublicParties(fetchedPublicParties);
            setMyParties(fetchedMyParties);
            setSortMode('date');
        } catch (error: any) {
            console.error("Error fetching common room data:", error);
            toast({ variant: 'destructive', title: 'Error fetching data', description: error.message || 'An unknown error occurred' });
        } finally {
            setIsLoading(false);
            setIsInitialLoad(false);
        }
    });
    
    const extractCoordsFromUrl = useStableCallback(async (url: string): Promise<{ lat: number; lon: number } | null> => {
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
    });

    const processPartiesWithLocation = useStableCallback(async (location: { lat: number, lon: number }) => {
        if (isInitialLoad) return; // Guard against running before data is loaded

        setIsProcessingLocation(true);
        try {
            const processList = async (list: ClientParty[]) => {
                const withDistance = await Promise.all(list.map(async (party) => {
                    const coords = await extractCoordsFromUrl(party.location);
                    return { ...party, distance: coords ? calculateDistance(location, coords) : undefined };
                }));
                withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
                return withDistance;
            };

            const [sortedPublic, sortedMy] = await Promise.all([
                processList(publicParties),
                processList(myParties)
            ]);

            setPublicParties(sortedPublic);
            setMyParties(sortedMy);
            setSortMode('distance');
        } catch (error) {
            console.error("Error processing parties with location:", error);
            toast({ variant: 'destructive', title: 'Calculation Error', description: 'Could not calculate distances for meetups.' });
        } finally {
            setIsProcessingLocation(false);
        }
    });

    const handleSortByDistance = useStableCallback((shouldEnable: boolean) => {
        if (!shouldEnable) {
            setPublicParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
            setMyParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
            setSortMode('date');
            setUserLocation(null);
            return;
        }
        
        if (userLocation) {
            processPartiesWithLocation(userLocation);
        } else {
            setIsLocationLoading(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = { lat: position.coords.latitude, lon: position.coords.longitude };
                    setUserLocation(loc);
                    setIsLocationLoading(false);
                },
                (error) => {
                    toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services in your browser.' });
                    setIsLocationLoading(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
            );
        }
    });
    
    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);
    
    useEffect(() => {
        if (userLocation && sortMode === 'date') {
            processPartiesWithLocation(userLocation);
        }
    }, [userLocation, sortMode, processPartiesWithLocation]);


    const { publicVibes } = useMemo(() => {
        const publicV = allVibes.filter(v => v.isPublic);
        return {
            publicVibes: publicV
        };
    }, [allVibes]);

    const { upcomingPublicParties, upcomingMyParties } = useMemo(() => {
        const now = new Date();
        const filterUpcoming = (parties: ClientParty[]) => parties.filter(p => new Date(p.startTime) >= now);
        return {
            upcomingPublicParties: filterUpcoming(publicParties),
            upcomingMyParties: filterUpcoming(myParties),
        }
    }, [publicParties, myParties]);
    
     const locationStatus = isLocationLoading ? 'loading' : userLocation ? 'success' : 'idle';

    return (
         <Dialog open={!!selectedParty} onOpenChange={(open) => !open && setSelectedParty(null)}>
            <div className="space-y-6">
                <Card data-tour="cr-welcome-card">
                    <CardHeader>
                        <CardTitle>Welcome to the Common Room</CardTitle>
                        <CardDescription>
                            A place to connect with other travelers. Discover public discussions or check your private invites.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center gap-2">
                        <CreateVibeDialog onVibeCreated={fetchData} />
                        <Button onClick={() => startTour(commonRoomTourSteps)}>
                            <HelpCircle className="mr-2 h-4 w-4" />
                            Take a Tour
                        </Button>
                    </CardContent>
                </Card>

                {isLoading ? (
                    <div className="flex justify-center items-center py-8">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={handleTabChange} data-tour="cr-tabs">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="public-vibes" data-tour="cr-public-vibes-tab"><Eye className="mr-2"/> Public Vibes</TabsTrigger>
                            <TabsTrigger value="public-meetups" data-tour="cr-public-meetups-tab"><MapPin className="mr-2"/> Public Meetups</TabsTrigger>
                            <TabsTrigger value="my-vibes" data-tour="cr-my-vibes-tab"><MessageSquare className="mr-2"/> My Vibes</TabsTrigger>
                            <TabsTrigger value="my-meetups" data-tour="cr-my-meetups-tab"><CalendarIcon className="mr-2"/> My Meetups</TabsTrigger>
                        </TabsList>
                        <TabsContent value="public-vibes" className="mt-4">
                            <VibeList vibes={publicVibes} title="Public Discussions" tourId="cr-public-vibes" onVibeClick={handleVibeClick} />
                        </TabsContent>
                        <TabsContent value="public-meetups" className="mt-4">
                            <PartyList parties={upcomingPublicParties} title="All Public Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} onSelectParty={setSelectedParty} />
                        </TabsContent>
                        <TabsContent value="my-vibes" className="mt-4">
                            <VibeList vibes={allVibes} title="My Vibes & Invites" onVibeClick={handleVibeClick} />
                        </TabsContent>
                        <TabsContent value="my-meetups" className="mt-4">
                            <PartyList parties={upcomingMyParties} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} onSelectParty={setSelectedParty} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
            {selectedParty && <MeetupDetailsDialog party={selectedParty} onUpdate={fetchData} />}
        </Dialog>
    )
}

function MeetupDetailsDialog({ party, onUpdate }: { party: ClientParty, onUpdate: () => void }) {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [editableMeetup, setEditableMeetup] = useState<Partial<Party>>(party);
    const [vibeData, setVibeData] = useState<Vibe | null>(null);

    const [attendees, setAttendees] = useState<UserProfile[]>([]);
    const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);

    useEffect(() => {
        setEditableMeetup(party);
    }, [party]);
    
    const fetchAttendees = useCallback(async () => {
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
    }, [party.rsvps, toast]);

    useEffect(() => {
        const vibeDocRef = doc(db, 'vibes', party.vibeId);
        const unsubscribe = onSnapshot(vibeDocRef, (doc) => {
            setVibeData(doc.exists() ? { id: doc.id, ...doc.data() } as Vibe : null);
        });
        
        fetchAttendees();
        
        return () => unsubscribe();
    }, [party.vibeId, fetchAttendees]);

    const isCurrentUserHost = useMemo(() => {
        if (!user || !vibeData) return false;
        return (vibeData as Vibe)?.hostEmails?.includes(user.email!);
    }, [user, vibeData]);
    
    const handleRemoveAttendee = async (attendeeId: string) => {
        if (!user) return;
        const result = await removeRsvp(party.vibeId, party.id, user.uid, attendeeId);
        if (result.success) {
            toast({ title: 'Attendee Removed', description: 'Their RSVP has been canceled.' });
            onUpdate();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not remove attendee.' });
        }
    }


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
                onUpdate();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update meetup.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRsvp = async (isRsvping: boolean) => {
        if (!user) return;
        const result = await rsvpToMeetup(party.vibeId, party.id, user.uid, isRsvping);
        if(!result.success) {
            toast({variant: 'destructive', title: 'Error', description: 'Could not update your RSVP status.'});
        }
        onUpdate();
    }

     const handleStartPrivateChat = async (attendee: {id?: string, name: string, email: string}) => {
        if (!user || !user.displayName || !user.email || !attendee.id) return;
        
        const result = await startPrivateVibe({
            initiator: { uid: user.uid, name: user.displayName, email: user.email },
            attendee: { uid: attendee.id, name: attendee.name, email: attendee.email }
        });
        
        if (result.success && result.vibeId) {
            toast({ title: 'Private Vibe Created!', description: `You can now chat privately with ${attendee.name}.` });
            router.push(`/common-room/${result.vibeId}`);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not start private chat.' });
        }
    };
    
    const handleSendFriendRequest = async (attendee: {id?: string, name: string, email: string}) => {
        if (!user || !user.displayName || !user.email) return;
        const result = await sendFriendRequest({ uid: user.uid, name: user.displayName, email: user.email }, attendee.email);
        if (result.success) {
            toast({ title: 'Request Sent', description: `Friend request sent to ${attendee.name}.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    };
    
    const isUserRsvpd = user && party.rsvps?.includes(user.uid);

    const handleAddToCalendar = () => {
        if (!party) return;

        const toICSDate = (date: Date) => {
            return date.toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';
        };

        const startDate = toICSDate(new Date(party.startTime));
        const endDate = toICSDate(new Date(party.endTime));

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//VibeSync//Meetup//EN',
            'BEGIN:VEVENT',
            `UID:${party.id}@vibesync.com`,
            `DTSTAMP:${toICSDate(new Date())}`,
            `DTSTART:${startDate}`,
            `DTEND:${endDate}`,
            `SUMMARY:${party.title}`,
            `DESCRIPTION:${party.description || `Meetup for Vibe: ${party.vibeTopic}`}`,
            `LOCATION:${party.location}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${party.title.replace(/[^a-z0-9]/gi, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <DialogContent className="max-w-md">
            <DialogHeader>
                {isEditing ? (
                    <Input value={editableMeetup.title} onChange={(e) => setEditableMeetup(p => ({...p, title: e.target.value}))} className="text-lg font-semibold" />
                ) : (
                    <DialogTitle>{party.title}</DialogTitle>
                )}
                    <div className="space-y-1 pt-1">
                    <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                        <MapPin className="h-4 w-4" /> Location
                    </a>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button onClick={handleAddToCalendar} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
                                    <CalendarPlus className="h-4 w-4" />
                                    <span>{format(new Date(party.startTime), 'MMM d, h:mm a')}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Add to Calendar</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                {party.description && (
                    <DialogDescription className="pt-2">{party.description}</DialogDescription>
                )}
            </DialogHeader>
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
                                const isCurrentUser = attendee.id === user?.uid;
                                const isAlreadyFriend = userProfile?.friends?.includes(attendee.id!);
                                return (
                                <div key={attendee.id} className="flex items-center gap-2 group">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback>{attendee.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <span className="text-sm font-medium">{attendee.name}</span>
                                        {isHost && <Badge variant="secondary" className="ml-2">Host</Badge>}
                                    </div>
                                    {!isCurrentUser && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleStartPrivateChat(attendee)}>
                                                            <MessageSquare className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Start private chat</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                                <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isAlreadyFriend} onClick={() => handleSendFriendRequest(attendee)}>
                                                            <UserPlus className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>{isAlreadyFriend ? 'Already friends' : 'Add friend'}</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                                {isCurrentUserHost && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRemoveAttendee(attendee.id!)}>
                                                                <UserX className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Remove from RSVP</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )})}
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
                            <Button onClick={() => handleRsvp(!isUserRsvpd)} variant={isUserRsvpd ? 'secondary' : 'default'} className="flex-1">
                            {isUserRsvpd ? `I'm Out (${party.rsvps?.length || 0})` : `I'm In! (${party.rsvps?.length || 0})`}
                            </Button>
                    </>
                )}
            </DialogFooter>
        </DialogContent>
    )
}
