"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink, Compass, UserCircle, Calendar, Users as UsersIcon, LocateFixed, LocateOff, Tabs as TabsIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVibes, startVibe, getUpcomingParties } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


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
    
    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        if (lat1 === lat2 && lon1 === lon2) {
            return 0;
        }
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const extractCoordsFromUrl = (url: string): { lat: number, lon: number } | null => {
        const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/daddr=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (match && match[1] && match[2]) {
            return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
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
                    setUserLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                    setLocationStatus('success');
                },
                (error) => {
                    console.warn("Could not get user location:", error.message);
                    setUserLocation(null); 
                    setLocationStatus('denied');
                }
            );
        }
    }, [activeTab]);
    
    useEffect(() => {
        if (publicParties.length > 0) {
            const partiesWithDistance = publicParties.map(party => {
                const coords = userLocation ? extractCoordsFromUrl(party.location) : null;
                let distance: number | undefined;
                if (coords && userLocation) {
                    distance = getDistance(userLocation.lat, userLocation.lon, coords.lat, coords.lon);
                }
                return { ...party, distance };
            });

            if(userLocation) {
                partiesWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
            }

            setSortedPublicParties(partiesWithDistance);
        } else {
            setSortedPublicParties([]);
        }
    }, [userLocation, publicParties]);


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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <PartyList parties={sortedPublicParties} title="Public Meetups" locationStatus={locationStatus} />
                                    <VibeList vibes={publicVibes} parties={publicParties} title="Public Vibes" />
                                </div>
                            </TabsContent>
                            <TabsContent value="my-space" className="mt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <PartyList parties={myMeetups} title="My Upcoming Meetups" locationStatus={'unavailable'} />
                                    <VibeList vibes={myVibes} parties={publicParties} title="My Vibes & Invites" />
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
