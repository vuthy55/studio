
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, MapPin, ExternalLink, Calendar, LocateFixed, LocateOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCommonRoomData } from '@/actions/common-room';
import { ClientParty } from '@/lib/types';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveUrlAction } from '@/actions/scraper';
import { MeetupDetailsDialog } from '@/app/common-room/MeetupDetailsDialog';
import { getCommonRoomCache, setCommonRoomCache } from '@/services/cache';

function PartyList({ parties, title, onSortByDistance, onSortByDate, sortMode, isCalculatingDistance, locationStatus }: { parties: ClientParty[], title: string, onSortByDistance: () => void, onSortByDate: () => void, sortMode: 'date' | 'distance', isCalculatingDistance: boolean, locationStatus: 'idle' | 'loading' | 'success' | 'error' }) {
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
                    <p>To plan one, find a Vibe in the 'Chatz' tab and use the "Start a Meetup" button inside it.</p>
                </div>
            ) : (
                parties.map(party => (
                    <MeetupDetailsDialog key={party.id} party={party}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer text-left">
                            <CardContent className="p-4 space-y-2">
                                {typeof party.distance === 'number' && (
                                    <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                                )}
                                <h4 className="font-semibold">{party.title}</h4>
                                <div className="text-sm text-muted-foreground mt-2 space-y-1">
                                    <p>From Vibe: <Link href={`/common-room/${party.vibeId}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{party.vibeTopic}</Link></p>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        <a href={party.location} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
                    </MeetupDetailsDialog>
                ))
            )}
        </div>
    );
}

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

export default function MeetupsTab() {
    const { user, loading } = useUserData();
    const { toast } = useToast();

    const [myMeetups, setMyMeetups] = useState<ClientParty[]>([]);
    const [publicMeetups, setPublicMeetups] = useState<ClientParty[]>([]);

    const [isFetching, setIsFetching] = useState(true);
    
    const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [sortMode, setSortMode] = useState<'date' | 'distance'>('date');
    const [isProcessingLocation, setIsProcessingLocation] = useState(false);

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setIsFetching(false);
            return;
        }

        const cachedData = await getCommonRoomCache();
        if (cachedData) {
            setMyMeetups(cachedData.myMeetups);
            setPublicMeetups(cachedData.publicMeetups);
            setIsFetching(false);
        } else {
            setIsFetching(true);
        }

        try {
            const serverData = await getCommonRoomData(user.email);
            setMyMeetups(serverData.myMeetups);
            setPublicMeetups(serverData.publicMeetups);
            await setCommonRoomCache(serverData);
        } catch (error: any) {
            console.error("Error fetching meetups data:", error);
            if (!cachedData) {
                toast({ variant: 'destructive', title: 'Error fetching data', description: error.message || 'An unknown error occurred' });
            }
        } finally {
            setIsFetching(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (!loading) {
            fetchData();
        }
    }, [loading, user, fetchData]);
    
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
            const processList = async (list: ClientParty[], setter: React.Dispatch<React.SetStateAction<ClientParty[]>>) => {
                 const partiesWithDistance = await Promise.all(list.map(async (party) => {
                    const coords = await extractCoordsFromUrl(party.location);
                    let distance;
                    if (coords) {
                        distance = calculateDistance(location, coords);
                    }
                    return { ...party, distance };
                }));
                partiesWithDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
                setter(partiesWithDistance);
            };

            await Promise.all([
                processList(publicMeetups, setPublicMeetups),
                processList(myMeetups, setMyMeetups)
            ]);

            setSortMode('distance');
            setLocationStatus('success');
        } catch (error) {
            console.error("Error processing parties with location:", error);
            toast({ variant: 'destructive', title: 'Calculation Error', description: 'Could not calculate distances for meetups.' });
            setLocationStatus('error');
        } finally {
            setIsProcessingLocation(false);
        }
    }, [publicMeetups, myMeetups, extractCoordsFromUrl, toast]);


    const handleSortByDistance = () => {
        setLocationStatus('loading');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lon: position.coords.longitude };
                processPartiesWithLocation(loc);
            },
            (error) => {
                toast({ variant: 'destructive', title: 'Location Error', description: 'Could not get your location. Please enable location services.' });
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

    if (isFetching) {
        return (
            <div className="flex justify-center items-center py-8">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Tabs defaultValue="public">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="public">Public</TabsTrigger>
                <TabsTrigger value="my-invites">My Invites</TabsTrigger>
            </TabsList>
            <TabsContent value="public" className="mt-4">
                 <PartyList parties={publicMeetups} title="Public Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} />
            </TabsContent>
            <TabsContent value="my-invites" className="mt-4">
                <PartyList parties={myMeetups} title="My Upcoming Meetups" onSortByDistance={handleSortByDistance} onSortByDate={handleSortByDate} sortMode={sortMode} isCalculatingDistance={isProcessingLocation} locationStatus={locationStatus} />
            </TabsContent>
        </Tabs>
    );
}

