
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Tabs as TabsIcon, Bell, RefreshCw, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, getUpcomingParties } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { getCityFromCoords } from '@/ai/flows/get-city-from-coords-flow';
import { notificationSound } from '@/lib/sounds';

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

function PartyList({ parties, title, onSortByCity, onSortByDate, sortMode, isCalculatingDistance, locationStatus, userCity }: { parties: ClientParty[], title: string, onSortByCity: () => void, onSortByDate: () => void, sortMode: 'date' | 'distance', isCalculatingDistance: boolean, locationStatus: 'idle' | 'loading' | 'success' | 'error', userCity: string | null }) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-xl">{title}</h3>
                 <div className="flex items-center gap-2">
                    {sortMode === 'distance' ? (
                        <Button variant="outline" size="sm" onClick={onSortByDate}><Calendar className="mr-2"/> Sort by Date</Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={onSortByCity} disabled={isCalculatingDistance}>
                            {isCalculatingDistance ? <LoaderCircle className="h-4 w-4 animate-spin mr-2"/> : <LocateFixed className="h-4 w-4 mr-2" />}
                            Parties Near Me
                        </Button>
                    )}
                </div>
            </div>
            {locationStatus === 'loading' && (
                <div className="text-sm text-muted-foreground text-center py-4">Finding meetups in your city...</div>
            )}
            {locationStatus === 'success' && sortMode === 'distance' && userCity && (
                 <div className="text-sm text-muted-foreground text-center py-2 bg-muted rounded-md">Showing meetups in or near <strong>{userCity}</strong>.</div>
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


export default function CommonRoomClient() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const [allVibes, setAllVibes] = useState<ClientVibe[]>([]);
    const [publicParties, setPublicParties] = useState<ClientParty[]>([]); // This holds the original, unsorted list
    const [displayedParties, setDisplayedParties] = useState<ClientParty[]>([]); // This is what gets rendered
    
    const [isFetching, setIsFetching] = useState(true);
    const [activeTab, setActiveTab] = useState('discover');
    const [activeDiscoverTab, setActiveDiscoverTab] = useState('meetups');
    const [activeMySpaceTab, setActiveMySpaceTab] = useState('meetups');
    
    const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);
    const [userCity, setUserCity] = useState<string | null>(null);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setAllVibes([]);
            setPublicParties([]);
            setDisplayedParties([]);
            setIsFetching(false);
            return;
        }
        setIsFetching(true);
        try {
            const [fetchedVibes, fetchedParties] = await Promise.all([
                getVibes(user.email),
                getUpcomingParties(),
            ]);
            setAllVibes(fetchedVibes);
            // Default sort by date
            const sortedParties = [...fetchedParties].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            setPublicParties(sortedParties);
            setDisplayedParties(sortedParties);
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
    
    const handleSortByCity = () => {
        setLocationStatus('loading');
        setIsProcessingLocation(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const { city } = await getCityFromCoords({ lat: latitude, lon: longitude });
                    setUserCity(city);
                    
                    const lowerCity = city.toLowerCase();
                    const filteredParties = publicParties.filter(party => 
                        party.title.toLowerCase().includes(lowerCity) ||
                        party.vibeTopic.toLowerCase().includes(lowerCity)
                    );
                    
                    setDisplayedParties(filteredParties);
                    setSortMode('distance');
                    setLocationStatus('success');

                } catch (aiError) {
                    console.error("AI city lookup failed:", aiError);
                    toast({ variant: 'destructive', title: 'Could not determine city', description: 'The AI could not identify your city from your location.' });
                    setLocationStatus('error');
                } finally {
                    setIsProcessingLocation(false);
                }
            },
            (error) => {
                toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services in your browser.' });
                setLocationStatus('error');
                setIsProcessingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
        );
    };


    const handleSortByDate = () => {
        const sortedByDate = [...publicParties].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        setDisplayedParties(sortedByDate);
        setSortMode('date');
        setLocationStatus('idle');
    };


    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);
    

    const { publicVibes, myVibes, myMeetups } = useMemo(() => {
        const publicV = allVibes.filter(v => v.isPublic);
        const myVibeIds = new Set(allVibes.map(v => v.id));
        const myM = displayedParties.filter(p => myVibeIds.has(p.vibeId));
        
        return {
            publicVibes: publicV,
            myVibes: allVibes,
            myMeetups: myM,
        };
    }, [allVibes, displayedParties]);


    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <CreateVibeDialog onVibeCreated={fetchData} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Welcome to the Common Room</CardTitle>
                    <CardDescription>
                        A place to connect with other travelers. Discover public discussions or check your private invites.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? (
                        <div className="flex justify-center items-center py-8">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="discover"><Compass className="mr-2"/> Discover</TabsTrigger>
                                <TabsTrigger value="my-space"><UserCircle className="mr-2"/> My Space</TabsTrigger>
                            </TabsList>
                            <TabsContent value="discover" className="mt-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <Button 
                                            variant={activeDiscoverTab === 'meetups' ? 'default' : 'outline'}
                                            onClick={() => setActiveDiscoverTab('meetups')}
                                        >
                                            <Calendar className="mr-2"/> Public Meetups
                                        </Button>
                                         <Button 
                                            variant={activeDiscoverTab === 'vibes' ? 'default' : 'outline'}
                                            onClick={() => setActiveDiscoverTab('vibes')}
                                        >
                                            <MessageSquare className="mr-2"/> Public Vibes
                                        </Button>
                                    </div>
                                    <div className="pt-4">
                                        {activeDiscoverTab === 'meetups' && <PartyList parties={displayedParties} title="Public Meetups" onSortByCity={handleSortByCity} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} userCity={userCity} />}
                                        {activeDiscoverTab === 'vibes' && <VibeList vibes={publicVibes} parties={publicParties} title="Public Vibes" source="discover" />}
                                    </div>
                                </div>
                            </TabsContent>
                            <TabsContent value="my-space" className="mt-4">
                               <div className="space-y-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <Button 
                                            variant={activeMySpaceTab === 'meetups' ? 'default' : 'outline'}
                                            onClick={() => setActiveMySpaceTab('meetups')}
                                        >
                                            <Calendar className="mr-2"/> My Meetups
                                        </Button>
                                         <Button 
                                            variant={activeMySpaceTab === 'vibes' ? 'default' : 'outline'}
                                            onClick={() => setActiveMySpaceTab('vibes')}
                                        >
                                            <MessageSquare className="mr-2"/> My Vibes
                                        </Button>
                                    </div>
                                    <div className="pt-4">
                                        {activeMySpaceTab === 'meetups' && <PartyList parties={myMeetups} title="My Upcoming Meetups" onSortByCity={handleSortByCity} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} userCity={userCity} />}
                                        {activeMySpaceTab === 'vibes' && <VibeList vibes={myVibes} parties={publicParties} title="My Vibes & Invites" source="my-space" />}
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
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
