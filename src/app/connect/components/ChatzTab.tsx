
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
import { LoaderCircle, PlusCircle, MessageSquare, Lock, Search, Tags, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCommonRoomData, startVibe } from '@/actions/common-room';
import { ClientVibe, ClientParty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTour, TourStep } from '@/context/TourContext';
import { cn } from '@/lib/utils';
import { getCommonRoomCache, setCommonRoomCache } from '@/services/cache';

const chatzTourSteps: TourStep[] = [
  {
    selector: '[data-tour="chatz-community-tab"]',
    content: "The 'Community' tab is where you can find all public chats (called 'Vibes'). Join any that interest you!",
  },
  {
    selector: '[data-tour="chatz-private-tab"]',
    content: "The 'Private' tab shows all the invite-only chats you're a member of. Think of it as your personal inbox.",
  },
  {
    selector: '[data-tour="chatz-start-vibe-button"]',
    content: "Ready to start your own conversation? Click here to create a new Vibe. You can make it public for everyone or private for a select group.",
    position: 'bottom',
  },
];


function CreateVibeDialog({ onVibeCreated, children }: { onVibeCreated: () => void, children: React.ReactNode }) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [topic, setTopic] = useState('');
    const [tags, setTags] = useState('');
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
            const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
            await startVibe({ 
                topic, 
                isPublic, 
                creatorId: user.uid, 
                creatorName: user.displayName || user.email,
                creatorEmail: user.email,
                tags: tagArray,
            });
            toast({ title: 'Vibe Created!', description: 'Your new chat is ready.' });
            setIsOpen(false);
            setTopic('');
            setTags('');
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
                    <DialogTitle>Start a New Chat (Vibe)</DialogTitle>
                    <DialogDescription>Create a new discussion topic for the community.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="vibe-topic">Topic</Label>
                        <Input id="vibe-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., Best street food in Bangkok?"/>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="vibe-tags">Tags (comma-separated)</Label>
                        <Input id="vibe-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g., food, thailand, budget" />
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


export default function ChatzTab() {
    const { user, loading } = useUserData();
    const { toast } = useToast();
    const { startTour } = useTour();

    const [myVibes, setMyVibes] = useState<ClientVibe[]>([]);
    const [publicVibes, setPublicVibes] = useState<ClientVibe[]>([]);
    
    const [isFetching, setIsFetching] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = useCallback(async () => {
        if (!user || !user.email) {
            setIsFetching(false);
            return;
        }

        const cachedData = await getCommonRoomCache();
        if (cachedData) {
            setMyVibes(cachedData.myVibes);
            setPublicVibes(cachedData.publicVibes);
            setIsFetching(false); 
        } else {
            setIsFetching(true); 
        }

        try {
            const serverData = await getCommonRoomData(user.email);
            setMyVibes(serverData.myVibes);
            setPublicVibes(serverData.publicVibes);
            await setCommonRoomCache(serverData);
        } catch (error: any) {
            console.error("Error fetching common room data:", error);
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
    

    const filteredPublicVibes = useMemo(() => {
        if (!searchTerm) return publicVibes;
        const lowercasedTerm = searchTerm.toLowerCase();
        return publicVibes.filter(vibe => 
            vibe.topic.toLowerCase().includes(lowercasedTerm) || 
            vibe.tags?.some(tag => tag.toLowerCase().includes(lowercasedTerm))
        );
    }, [publicVibes, searchTerm]);

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Chatz</CardTitle>
                        <CardDescription>Join public discussions or check your private invites.</CardDescription>
                    </div>
                     <CreateVibeDialog onVibeCreated={fetchData}>
                        <Button data-tour="chatz-start-vibe-button">
                            <PlusCircle className="mr-2 h-4 w-4"/>
                            Start a Vibe
                        </Button>
                    </CreateVibeDialog>
                </div>
            </CardHeader>
            <CardContent>
                {isFetching ? (
                    <div className="flex justify-center items-center py-8">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Tabs defaultValue="community">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="community" data-tour="chatz-community-tab">Community</TabsTrigger>
                            <TabsTrigger value="private" data-tour="chatz-private-tab">Private</TabsTrigger>
                        </TabsList>
                        <TabsContent value="community" className="mt-4">
                            <VibeList vibes={filteredPublicVibes} title="Public Vibes" searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                        </TabsContent>
                        <TabsContent value="private" className="mt-4">
                            <VibeList vibes={myVibes} title="My Vibes & Invites" />
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    )
}

function VibeList({ vibes, title, searchTerm, setSearchTerm }: { vibes: ClientVibe[], title: string, searchTerm?: string, setSearchTerm?: (term: string) => void }) {
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-xl">{title}</h3>
                 {setSearchTerm && (
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search by topic or tag..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                 )}
            </div>
            {vibes.length === 0 ? (
                <div className="text-muted-foreground text-sm text-center py-8">
                    <p>{searchTerm ? 'No vibes match your search.' : 'No chats here. Why not start one?'}</p>
                </div>
            ) : (
                 <div className="border rounded-lg">
                    {vibes.map((vibe, index) => (
                        <Link href={`/common-room/${vibe.id}`} key={vibe.id} className="block">
                            <div className={`flex items-center p-4 hover:bg-muted/50 transition-colors ${index < vibes.length - 1 ? 'border-b' : ''}`}>
                                <div className="flex-1 space-y-1">
                                    <p className="font-semibold flex items-center gap-2">
                                        {!vibe.isPublic && <Lock className="h-3 w-3 text-muted-foreground" />}
                                        {vibe.topic}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {(vibe.tags || []).map(tag => (
                                            <Badge key={tag} variant="outline" className="flex items-center gap-1">
                                                <Tags className="h-3 w-3" />
                                                {tag}
                                            </Badge>
                                        ))}
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
                    ))}
                </div>
            )}
        </div>
    );
}

