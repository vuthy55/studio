
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, HelpCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, getUpcomingPublicParties, getAllMyUpcomingParties } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { resolveUrlAction } from '@/actions/scraper';
import { useTour, TourStep } from '@/context/TourContext';
import { Separator } from '@/components/ui/separator';

const commonRoomTourSteps: TourStep[] = [
  {
    selector: '[data-tour="cr-welcome-card"]',
    content: "Welcome to the Common Room! This is your hub for connecting with other travelers.",
  },
  {
    selector: '[data-tour="cr-public-meetups"]',
    content: "Here you'll find all public meetups. You can use the 'Parties Near Me' button to sort them by your current location.",
    position: 'bottom',
  },
  {
    selector: '[data-tour="cr-my-meetups"]',
    content: "This section shows meetups for vibes you're a part of, giving you a personal agenda.",
    position: 'bottom',
  },
  {
    selector: '[data-tour="cr-my-vibes"]',
    content: "And finally, here are all the discussion vibes you've joined or been invited to. Click any of them to jump into the conversation.",
    position: 'bottom',
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
                    <p>To plan one, start a Vibe and use the "Start a Meetup" button inside it.</p>
                </div>
            ) : (
                parties.map(party => (
                    <Card key={party.id} className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4 space-y-2">
                             {typeof party.distance === 'number' && (
                                <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                            )}
                            <div className="flex-1">
                                <h4 className="font-semibold">{party.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                From Vibe: <Link href={`/common-room/${party.vibeId}`} className="text-primary hover:underline">{party.vibeTopic}</Link>
                                </p>
                            </div>
                            <div className="text-sm text-muted-foreground mt-2 space-y-1">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                        View Location <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">When:</span>
                                    <span>{format(new Date(party.startTime), 'MMM d, h:mm a')}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
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


export default function CommonRoomClient() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const { startTour } = useTour();
    const [allVibes, setAllVibes] = useState<ClientVibe[]>([]);
    
    // Have separate states for each list of parties
    const [publicParties, setPublicParties] = useState<ClientParty[]>([]);
    const [myParties, setMyParties] = useState<ClientParty[]>([]); 
    
    const [isFetching, setIsFetching] = useState(true);
    
    const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);

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

    const processPartiesWithLocation = useCallback(async (location: { lat: number, lon: number }) => {
        setIsProcessingLocation(true);
        try {
            // Process public parties
            const publicWithDistance = await Promise.all(publicParties.map(async (party) => {
                const coords = await extractCoordsFromUrl(party.location);
                return { ...party, distance: coords ? calculateDistance(location, coords) : undefined };
            }));
            publicWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
            setPublicParties(publicWithDistance);

            // Process my parties
             const myWithDistance = await Promise.all(myParties.map(async (party) => {
                const coords = await extractCoordsFromUrl(party.location);
                return { ...party, distance: coords ? calculateDistance(location, coords) : undefined };
            }));
            myWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
            setMyParties(myWithDistance);

            setSortMode('distance');
            setLocationStatus('success');
        } catch (error) {
            console.error("Error processing parties with location:", error);
            toast({ variant: 'destructive', title: 'Calculation Error', description: 'Could not calculate distances for meetups.' });
            setLocationStatus('error');
        } finally {
            setIsProcessingLocation(false);
        }
    }, [publicParties, myParties, extractCoordsFromUrl, toast]);


    const handleSortByDistance = (shouldEnable: boolean) => {
        if (!shouldEnable) {
            // Sort both lists by date
            setPublicParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
            setMyParties(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
            setSortMode('date');
            setLocationStatus('idle');
            return;
        }

        setLocationStatus('loading');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lon: position.coords.longitude };
                processPartiesWithLocation(loc);
            },
            (error) => {
                toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services in your browser.' });
                setLocationStatus('error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
        );
    };

    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);

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

            {isFetching ? (
                <div className="flex justify-center items-center py-8">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-8">
                    <PartyList parties={publicParties} title="Public Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} tourId="cr-public-meetups" />
                    <Separator />
                    <PartyList parties={myParties} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} tourId="cr-my-meetups" />
                    <Separator />
                    <VibeList vibes={allVibes} title="My Vibes & Invites" tourId="cr-my-vibes" />
                </div>
            )}
        </div>
    )
}

function VibeList({ vibes, title, tourId }: { vibes: ClientVibe[], title: string, tourId?: string }) {
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
                        return (
                            <Link href={`/common-room/${vibe.id}`} key={vibe.id} className="block">
                                <div className={`flex items-center p-4 hover:bg-muted/50 transition-colors ${index < vibes.length - 1 ? 'border-b' : ''}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{vibe.topic}</p>
                                            {vibe.activeMeetupId && <Badge variant="secondary">[Meetup]</Badge>}
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
