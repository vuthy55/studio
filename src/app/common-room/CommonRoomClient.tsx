
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
import { LoaderCircle, PlusCircle, MessageSquare, MapPin, ExternalLink } from 'lucide-react';
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

function VibeList({ vibes }: { vibes: ClientVibe[] }) {
    if (vibes.length === 0) {
        return (
            <p className="text-muted-foreground text-sm text-center py-8">
                No vibes in this category yet.
            </p>
        );
    }
    
    return (
        <div className="space-y-4">
            {vibes.map(vibe => (
                <Link key={vibe.id} href={`/common-room/${vibe.id}`} className="block">
                    <Card className="hover:border-primary transition-colors">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-lg">{vibe.topic}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Started by {vibe.creatorName}
                                    </p>
                                </div>
                                <Badge variant={vibe.isPublic ? 'secondary' : 'default'}>
                                    {vibe.isPublic ? 'Public' : 'Private'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
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
            ))}
        </div>
    );
}


function PartyList({ parties }: { parties: ClientParty[] }) {
    if (parties.length === 0) {
        return (
            <p className="text-muted-foreground text-sm text-center py-8">
                No upcoming parties. Why not plan one?
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {parties.map(party => (
                <Card key={party.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                             <div className="flex-1">
                                <h3 className="font-semibold text-lg">{party.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                   From Vibe: <Link href={`/common-room/${party.vibeId}`} className="text-primary hover:underline">{party.vibeTopic}</Link>
                                </p>
                             </div>
                             {party.distance && (
                                <Badge variant="outline">{party.distance.toFixed(1)} km away</Badge>
                             )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-4 space-y-2">
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
            ))}
        </div>
    );
}



export default function CommonRoomClient() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const [vibes, setVibes] = useState<ClientVibe[]>([]);
    const [parties, setParties] = useState<ClientParty[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [activeTab, setActiveTab] = useState('parties');


    const fetchVibes = useCallback(async () => {
        if (!user || !user.email) {
            setVibes([]);
            return;
        }
        setIsFetching(true);
        try {
            const fetchedVibes = await getVibes(user.email);
            setVibes(fetchedVibes);
        } catch (error: any) {
            console.error("Error fetching vibes:", error);
            toast({ variant: 'destructive', title: 'Error fetching vibes', description: error.message || 'An unknown error occurred' });
        } finally {
            setIsFetching(false);
        }
    }, [user, toast]);

    const fetchParties = useCallback(async () => {
         setIsFetching(true);
        try {
            const fetchedParties = await getUpcomingParties();
            setParties(fetchedParties);
        } catch (error: any) {
             console.error("Error fetching parties:", error);
            toast({ variant: 'destructive', title: 'Error fetching parties' });
        } finally {
             setIsFetching(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!loading && user) {
            fetchVibes();
            fetchParties();
        } else if (!loading && !user) {
            setIsFetching(false);
        }
    }, [loading, user, fetchVibes, fetchParties]);
    
    const { publicVibes, privateVibes } = useMemo(() => {
        return {
            publicVibes: vibes.filter(v => v.isPublic),
            privateVibes: vibes.filter(v => !v.isPublic)
        };
    }, [vibes]);


    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <CreateVibeDialog onVibeCreated={fetchVibes} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Welcome to the Common Room</CardTitle>
                    <CardDescription>
                        This is a place to connect with other travelers. Start a vibe or join an existing discussion.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? (
                        <div className="flex justify-center items-center py-8">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="parties">Parties</TabsTrigger>
                                <TabsTrigger value="public-vibes">Public Vibes</TabsTrigger>
                                <TabsTrigger value="my-invites">My Invites</TabsTrigger>
                            </TabsList>
                             <TabsContent value="parties" className="mt-4">
                                <PartyList parties={parties} />
                            </TabsContent>
                            <TabsContent value="public-vibes" className="mt-4">
                                <VibeList vibes={publicVibes} />
                            </TabsContent>
                            <TabsContent value="my-invites" className="mt-4">
                                <VibeList vibes={privateVibes} />
                            </TabsContent>
                        </Tabs>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
