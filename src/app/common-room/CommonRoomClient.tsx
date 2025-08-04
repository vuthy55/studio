
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Tabs as TabsIcon, Bell } from 'lucide-react';
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

function VibeList({ vibes, parties, title }: { vibes: ClientVibe[], parties: ClientParty[], title: string }) {
    if (vibes.length === 0) {
        return (
             <div className="space-y-4">
                <h3 className="font-bold text-xl">{title}</h3>
                <div className="text-muted-foreground text-sm text-center py-8 space-y-2">
                    <p className="font-semibold">No vibes here yet.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <h3 className="font-bold text-xl">{title}</h3>
            {vibes.map(vibe => {
                 const activeMeetup = vibe.activeMeetupId ? parties.find(p => p.id === vibe.activeMeetupId) : null;
                return (
                    <Link key={vibe.id} href={`/common-room/${vibe.id}`} className="block">
                        <Card className="hover:border-primary transition-colors">
                            <CardContent className="p-4 space-y-2">
                                {activeMeetup && (
                                    <div className="p-2 bg-primary/10 rounded-md border-l-4 border-primary">
                                        <p className="font-bold text-sm text-primary flex items-center gap-1.5"><Calendar className="h-4 w-4"/> Upcoming Meetup</p>
                                        <p className="text-sm text-primary/90 font-medium truncate">{activeMeetup.title}</p>
                                        <p className="text-xs text-primary/80">{format(new Date(activeMeetup.startTime), 'MMM d, h:mm a')}</p>
                                    </div>
                                )}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-semibold">{vibe.topic}</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Started by {vibe.creatorName}
                                        </p>
                                    </div>
                                    <Badge variant={vibe.isPublic ? 'secondary' : 'default'}>
                                        {vibe.isPublic ? 'Public' : 'Private'}
                                    </Badge>
                                </div>
                                
                                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                                    <div className="flex items-center gap-1">
                                        <MessageSquare className="h-3 w-3" />
                                        <span>{vibe.postsCount || 0} posts</span>
                                    </div>
                                    <span>
                                        {vibe.lastPostAt ? `Last post ${formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(vibe.createdAt), { addSuffix: true })}`}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                )
            })}
        </div>
    );
}


function PartyList({ parties, title, locationStatus }: { parties: ClientParty[], title: string, locationStatus: 'loading' | 'denied' | 'success' | 'unavailable' }) {
    
    return (
        <div className="space-y-4">
            <h3 className="font-bold text-xl">{title}</h3>
            {locationStatus === 'loading' && (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Getting your location to sort meetups...</div>
            )}
            {locationStatus === 'denied' && (
                <div className="text-sm text-destructive flex items-center gap-2"><LocateOff className="h-4 w-4" /> Location access denied. Showing all meetups.</div>
            )}
             {locationStatus === 'success' && (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><LocateFixed className="h-4 w-4" /> Sorting meetups by your location.</div>
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
    const [publicParties, setPublicParties] = useState<ClientParty[]>([]);
    const [sortedPublicParties, setSortedPublicParties] = useState<ClientParty[]>([]);
    
    const [isFetching, setIsFetching] = useState(true);
    const [activeTab, setActiveTab] = useState('discover');
    const [activeDiscoverTab, setActiveDiscoverTab] = useState('meetups');
    const [activeMySpaceTab, setActiveMySpaceTab] = useState('meetups');

    const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);
    const [locationStatus, setLocationStatus] = useState<'loading' | 'denied' | 'success' | 'unavailable'>('unavailable');
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const notifiedPartyIds = useRef(new Set<string>());

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setAllVibes([]);
            setPublicParties([]);
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
            setPublicParties(fetchedParties);
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
    
    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        if ((lat1 === lat2) && (lon1 === lon2)) {
            return 0;
        }
        else {
            const radlat1 = Math.PI * lat1/180;
            const radlat2 = Math.PI * lat2/180;
            const theta = lon1-lon2;
            const radtheta = Math.PI * theta/180;
            let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
            if (dist > 1) {
                dist = 1;
            }
            dist = Math.acos(dist);
            dist = dist * 180/Math.PI;
            dist = dist * 60 * 1.1515;
            // convert to kilometers
            dist = dist * 1.609344 
            return dist;
        }
    }

    const extractCoordsFromUrl = async (url: string): Promise<{ lat: number, lon: number } | null> => {
        if (!url) return null;
        let finalUrl = url;
        
        try {
            if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
                const result = await resolveUrlAction(url);
                if (result.success && result.finalUrl) {
                    finalUrl = result.finalUrl;
                } else {
                     return null;
                }
            }
        
            const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)|ll=(-?\d+\.\d+),(-?\d+\.\d+)|!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
            const match = finalUrl.match(regex);
        
            if (match) {
                const lat = parseFloat(match[1] || match[3] || match[5]);
                const lon = parseFloat(match[2] || match[4] || match[6]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    return { lat, lon };
                }
            }
        } catch (error) {
            console.error("Error resolving or parsing URL:", url, error);
        }

        return null;
    };


    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);
    
    useEffect(() => {
        if (activeTab === 'discover') {
            setLocationStatus('loading');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = { lat: position.coords.latitude, lon: position.coords.longitude };
                    setUserLocation(loc);
                    setLocationStatus('success');
                },
                (error) => {
                    setUserLocation(null); 
                    setLocationStatus('denied');
                }
            );
        }
    }, [activeTab]);
    
    useEffect(() => {
        const processParties = async () => {
            if (publicParties.length === 0) {
                setSortedPublicParties([]);
                return;
            }
            if (userLocation) {
                const partiesWithDistance = await Promise.all(publicParties.map(async (party) => {
                    const coords = await extractCoordsFromUrl(party.location);
                    let distance: number | undefined;
                    if (coords) {
                        distance = getDistance(userLocation.lat, userLocation.lon, coords.lat, coords.lon);
                    }
                    return { ...party, distance, coords };
                }));

                partiesWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
                setSortedPublicParties(partiesWithDistance);
                
                try {
                    const userCityData = await getCityFromCoords(userLocation);
                    for (const party of partiesWithDistance) {
                        if (party.coords && party.distance !== undefined && party.distance < 50 && !notifiedPartyIds.current.has(party.id)) {
                             const partyCityData = await getCityFromCoords(party.coords);
                             if (userCityData.city === partyCityData.city) {
                                toast({
                                    title: (<div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Nearby Meetup!</div>),
                                    description: `"${party.title}" is happening soon in ${userCityData.city}. Check it out!`,
                                    duration: 10000,
                                });
                                audioRef.current?.play().catch(console.error);
                                notifiedPartyIds.current.add(party.id);
                             }
                        }
                    }
                } catch(e) {
                    console.warn("[Nearby Check] Could not get city from coords, skipping notifications.", e);
                }

            } else {
                setSortedPublicParties(publicParties);
            }
        };

        processParties();
    }, [publicParties, userLocation, toast]);


    const { publicVibes, myVibes, myMeetups } = useMemo(() => {
        const publicV = allVibes.filter(v => v.isPublic);
        const myVibeIds = new Set(allVibes.map(v => v.id));
        const myM = publicParties.filter(p => myVibeIds.has(p.vibeId));
        
        return {
            publicVibes: publicV,
            myVibes: allVibes,
            myMeetups: myM,
        };
    }, [allVibes, publicParties]);


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
                                        {activeDiscoverTab === 'meetups' && <PartyList parties={sortedPublicParties} title="Public Meetups" locationStatus={locationStatus} />}
                                        {activeDiscoverTab === 'vibes' && <VibeList vibes={publicVibes} parties={publicParties} title="Public Vibes" />}
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
                                        {activeMySpaceTab === 'meetups' && <PartyList parties={myMeetups} title="My Upcoming Meetups" locationStatus={'unavailable'} />}
                                        {activeMySpaceTab === 'vibes' && <VibeList vibes={myVibes} parties={publicParties} title="My Vibes & Invites" />}
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

    