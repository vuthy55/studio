
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Bell, RefreshCw, ChevronRight, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCommonRoomData, startVibe } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { notificationSound } from '@/lib/sounds';
import { useTour, TourStep } from '@/context/TourContext';
import MainHeader from '@/components/layout/MainHeader';
import { MeetupDetailsDialog } from '@/app/common-room/MeetupDetailsDialog';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';


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

function CreateVibeDialog({ onVibeCreated, children }: { onVibeCreated: () => void, children: React.ReactNode }) {
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
                {children}
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
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer text-left">
                            <CardContent className="p-4 space-y-2">
                                 {typeof party.distance === 'number' && (
                                    <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                                )}
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-semibold flex-1">{party.title}</h4>
                                    <div className="text-right flex-shrink-0">
                                         <p className="font-semibold text-sm whitespace-nowrap">{format(new Date(party.startTime), 'MMM d')}</p>
                                         <p className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(party.startTime), 'h:mm a')}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <p className="text-muted-foreground">
                                        From: <Link href={`/common-room/${party.vibeId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{party.vibeTopic}</Link>
                                    </p>
                                    <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 w-fit" onClick={(e) => e.stopPropagation()}>
                                        <MapPin className="h-4 w-4" />
                                        Location
                                    </a>
                                </div>
                                {party.description && (
                                    <p className="text-xs text-muted-foreground truncate pt-1">{party.description}</p>
                                )}
                            </CardContent>
                        </Card>
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

export default function CommonRoomClient({ initialTab }: { initialTab: string }) {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const { startTour } = useTour();

    const [myVibes, setMyVibes] = useState<ClientVibe[]>([]);
    const [publicVibes, setPublicVibes] = useState<ClientVibe[]>([]);
    const [myMeetups, setMyMeetups] = useState<ClientParty[]>([]);
    const [publicMeetups, setPublicMeetups] = useState<ClientParty[]>([]);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    
    const [isFetching, setIsFetching] = useState(true);
    const [activeTab, setActiveTab] = useState<ActiveContentView>(initialTab as ActiveContentView);
    
    const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setMyVibes([]);
            setPublicVibes([]);
            setMyMeetups([]);
            setPublicMeetups([]);
            setDebugLog([]);
            setIsFetching(false);
            return;
        }
        setIsFetching(true);
        try {
            const data = await getCommonRoomData(user.email);
            setMyVibes(data.myVibes);
            setPublicVibes(data.publicVibes);
            setMyMeetups(data.myMeetups);
            setPublicMeetups(data.publicMeetups);
            setDebugLog(data.debugLog || []); // Ensure debugLog is always an array
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
                processPartiesWithLocation(loc, publicMeetups, setPublicMeetups);
                processPartiesWithLocation(loc, myMeetups, setMyMeetups);
            },
            (error) => {
                toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services in your browser.' });
                setLocationStatus('error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
        );
    };

    const handleSortByDate = () => {
        setPublicMeetups(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
        setMyMeetups(prev => [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
        setSortMode('date');
        setLocationStatus('idle');
    };


    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);

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
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                             <CreateVibeDialog onVibeCreated={fetchData}>
                                                <Button variant="default" data-tour="cr-start-vibe-button" className="w-full h-full flex flex-col items-center justify-center gap-1 py-2 rounded-r-none md:flex-row md:gap-2 data-[state=active]:bg-primary">
                                                    <PlusCircle className="h-5 w-5" />
                                                    <span className="hidden md:inline">Start a Vibe</span>
                                                </Button>
                                            </CreateVibeDialog>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="md:hidden"><p>Start a Vibe</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TabsTrigger value="public-meetups" data-tour="cr-discover-tab" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><Compass className="h-5 w-5" /><span className="hidden md:inline">Public Meetups</span></TabsTrigger>
                                <TabsTrigger value="public-vibes" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><MessageSquare className="h-5 w-5" /><span className="hidden md:inline">Public Vibes</span></TabsTrigger>
                                <TabsTrigger value="my-meetups" data-tour="cr-my-space-tab" className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2"><Calendar className="h-5 w-5" /><span className="hidden md:inline">My Meetups</span></TabsTrigger>
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
                            {activeTab === 'public-meetups' && <PartyList parties={publicMeetups} title="Public Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} debugLog={debugLog} />}
                            {activeTab === 'public-vibes' && <VibeList vibes={publicVibes} parties={publicMeetups} title="Public Vibes" source="public-vibes" />}
                            {activeTab === 'my-meetups' && <PartyList parties={myMeetups} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} debugLog={debugLog} />}
                            {activeTab === 'my-vibes' && <VibeList vibes={myVibes} parties={myMeetups} title="My Vibes & Invites" source="my-vibes" />}
                        </div>
                    )}
                </CardContent>
            </Card>

             {debugLog.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="debug-log">
                        <AccordionTrigger>Debug Information</AccordionTrigger>
                        <AccordionContent>
                            <ScrollArea className="h-48 w-full p-4 border rounded-md bg-muted font-mono text-xs">
                                {debugLog.map((log, index) => (
                                    <p key={index} className={cn(
                                        log.startsWith('[FAIL]') && 'text-red-500',
                                        log.startsWith('[CRITICAL]') && 'text-red-700 font-bold',
                                        log.startsWith('[SUCCESS]') && 'text-green-600',
                                    )}>
                                        {log}
                                    </p>
                                ))}
                            </ScrollArea>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
        </div>
    )
}

function VibeList({ vibes, parties, title, source }: { vibes: ClientVibe[], parties: ClientParty[], title: string, source: 'public-vibes' | 'my-vibes' }) {
    
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

    