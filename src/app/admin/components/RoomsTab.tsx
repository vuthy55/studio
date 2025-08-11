
"use client";

import React, { useState, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import type { ClientVibe } from '@/lib/types';
import { LoaderCircle, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getAllVibesAdmin, deleteVibesAdmin } from '@/actions/common-room-admin';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { permanentlyDeleteRooms } from '@/actions/room';

export default function RoomsTab() {
  const [syncOnlineRooms, setSyncOnlineRooms] = useState<ClientSyncRoom[]>([]);
  const [commonRooms, setCommonRooms] = useState<ClientVibe[]>([]);
  
  const [isVoiceRoomsLoading, setIsVoiceRoomsLoading] = useState(false);
  const [hasFetchedVoiceRooms, setHasFetchedVoiceRooms] = useState(false);
  
  const [isVibesLoading, setIsVibesLoading] = useState(false);
  const [hasFetchedVibes, setHasFetchedVibes] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [user] = useAuthState(auth);

  const handleFetchVoiceRooms = useCallback(async () => {
    setIsVoiceRoomsLoading(true);
    setHasFetchedVoiceRooms(true);
    try {
      const fetchedRooms = await getAllRooms();
      setSyncOnlineRooms(fetchedRooms);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load Voice Rooms.' });
    } finally {
      setIsVoiceRoomsLoading(false);
    }
  }, [toast]);
  
  const handleFetchVibes = useCallback(async () => {
    setIsVibesLoading(true);
    setHasFetchedVibes(true);
    try {
      const fetchedVibes = await getAllVibesAdmin();
      setCommonRooms(fetchedVibes);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load Vibes Rooms.' });
    } finally {
      setIsVibesLoading(false);
    }
  }, [toast]);
  
  const handleDeleteSyncOnlineRoom = async (roomId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms([roomId]);
        if (result.success) {
            toast({ title: "Success", description: `Room deleted.` });
            setSyncOnlineRooms(prev => prev.filter(r => r.id !== roomId));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete room.' });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleDeleteVibe = async (vibeId: string) => {
     if (!user) return;
    setIsDeleting(true);
    try {
        const result = await deleteVibesAdmin([vibeId]);
        if (result.success) {
            toast({ title: "Success", description: `Vibes Room deleted.` });
            setCommonRooms(prev => prev.filter(v => v.id !== vibeId));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete room.' });
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Room Management</CardTitle>
        <CardDescription>
          Manage private Voice Rooms and public/private Vibes Rooms.
        </CardDescription>
      </CardHeader>
      <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Voice Rooms</h3>
                    <Button onClick={handleFetchVoiceRooms} variant="outline" size="sm" disabled={isVoiceRoomsLoading}>
                        {isVoiceRoomsLoading ? <LoaderCircle className="animate-spin mr-2" /> : <RefreshCw className="mr-2" />}
                        {hasFetchedVoiceRooms ? 'Refresh' : 'Load Data'}
                    </Button>
                </div>
                <ScrollArea className="h-72 border rounded-md p-2">
                    <div className="pr-2 space-y-2">
                    {!hasFetchedVoiceRooms ? (
                        <p className="text-center text-sm text-muted-foreground p-4">Click 'Load Data' to see Voice Rooms.</p>
                    ) : isVoiceRoomsLoading ? (
                        <div className="flex justify-center items-center h-full"><LoaderCircle className="h-6 w-6 animate-spin" /></div>
                    ) : syncOnlineRooms.length > 0 ? syncOnlineRooms.map(room => (
                        <div key={room.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                            <div>
                                <p className="font-semibold">{room.topic}</p>
                                <div className="text-xs text-muted-foreground">
                                    Status: <Badge variant={room.status === 'active' ? 'default' : (room.status === 'closed' ? 'destructive' : 'secondary')} className="h-5">{room.status}</Badge>
                                </div>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteSyncOnlineRoom(room.id)} disabled={isDeleting}>
                                <Trash2 className="h-4 w-4 text-destructive"/>
                            </Button>
                        </div>
                    )) : <p className="text-center text-sm text-muted-foreground p-4">No Voice Rooms found.</p>}
                    </div>
                </ScrollArea>
            </div>
            <div className="space-y-4">
                 <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Vibes Rooms</h3>
                    <Button onClick={handleFetchVibes} variant="outline" size="sm" disabled={isVibesLoading}>
                        {isVibesLoading ? <LoaderCircle className="animate-spin mr-2" /> : <RefreshCw className="mr-2" />}
                        {hasFetchedVibes ? 'Refresh' : 'Load Data'}
                    </Button>
                 </div>
                <ScrollArea className="h-72 border rounded-md p-2">
                    <div className="pr-2 space-y-2">
                    {!hasFetchedVibes ? (
                         <p className="text-center text-sm text-muted-foreground p-4">Click 'Load Data' to see Vibes Rooms.</p>
                    ) : isVibesLoading ? (
                         <div className="flex justify-center items-center h-full"><LoaderCircle className="h-6 w-6 animate-spin" /></div>
                    ) : commonRooms.length > 0 ? commonRooms.map(vibe => (
                        <div key={vibe.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                            <div>
                                <p className="font-semibold">{vibe.topic}</p>
                                <p className="text-xs text-muted-foreground">
                                    {vibe.postsCount} posts &middot; Last active: {vibe.lastPostAt ? formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true }) : 'never'}
                                </p>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteVibe(vibe.id)} disabled={isDeleting}>
                                <Trash2 className="h-4 w-4 text-destructive"/>
                            </Button>
                        </div>
                    )) : <p className="text-center text-sm text-muted-foreground p-4">No Vibes Rooms found.</p>}
                    </div>
                </ScrollArea>
            </div>
          </div>
      </CardContent>
    </Card>
  );
}
