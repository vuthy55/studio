
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Tabs as TabsIcon, Bell, RefreshCw, HelpCircle, Eye, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMyVibes, startVibe, getUpcomingPublicParties, getAllMyUpcomingParties } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { notificationSound } from '@/lib/sounds';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTour, TourStep } from '@/context/TourContext';

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

function PartyList({ parties, title, onSortByDistance, sortMode, isCalculatingDistance, locationStatus, tourId }: { parties: ClientParty[], title: string, onSortByDistance: (enabled: boolean) => void, sortMode: 'date' | 'distance', isCalculatingDistance: boolean, locationStatus: 'idle' | 'loading' | 'success' | 'error', tourId?: string }) {
    return (
        <div className="space-y-4" data-tour={tourId}>
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-xl">{title}</h3>
                 <div className="flex items-center gap-2">
                    {sortMode === 'distance' ? (
                        <Button variant="outline" size="sm" onClick={() => onSortByDistance(false)}><Calendar className="mr-2"/> Sort by Date</Button>
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
                         <div key={party.id} className={`flex items-center p-4 hover:bg-muted/50 transition-colors ${index < parties.length - 1 ? 'border-b' : ''}`}>
                             <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                     <p className="font-semibold">{party.title}</p>
                                     {typeof party.distance === 'number' && (
                                        <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    In Vibe: <Link href={`/common-room/${party.vibeId}?tab=my-vibes`} className="text-primary hover:underline">{party.vibeTopic}</Link>
                                </p>
                                <div className="text-sm text-muted-foreground flex items-center gap-2 pt-1">
                                    <Calendar className="h-4 w-4" />
                                    <span>{format(new Date(party.startTime), 'MMM d, h:mm a')}</span>
                                </div>
                             </div>
                              <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                <Button variant="ghost" size="sm"><MapPin className="mr-2"/>View Map</Button>
                             </a>
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
                                        {isPrivate && <Badge variant="secondary">Private</Badge>}
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
    const { user, loading } = useUserData();
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

            fetchedMyParties.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            
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


    const { filteredPublicVibes } = useMemo(() => {
        return {
            filteredPublicVibes: allVibes.filter(v => v.isPublic),
        };
    }, [allVibes]);
    
     const locationStatus = isLocationLoading ? 'loading' : userLocation ? 'success' : 'idle';

    return (
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
                        <TabsTrigger value="my-meetups" data-tour="cr-my-meetups-tab"><Calendar className="mr-2"/> My Meetups</TabsTrigger>
                    </TabsList>
                    <TabsContent value="public-vibes" className="mt-4">
                        <VibeList vibes={filteredPublicVibes} title="Public Discussions" tourId="cr-public-vibes" onVibeClick={handleVibeClick} />
                    </TabsContent>
                    <TabsContent value="public-meetups" className="mt-4">
                        <PartyList parties={publicParties} title="All Public Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} />
                    </TabsContent>
                     <TabsContent value="my-vibes" className="mt-4">
                         <VibeList vibes={allVibes} title="My Vibes & Invites" onVibeClick={handleVibeClick} />
                    </TabsContent>
                     <TabsContent value="my-meetups" className="mt-4">
                        <PartyList parties={myParties} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
