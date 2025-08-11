
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
  
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [user] = useAuthState(auth);

  const handleFetchData = useCallback(async () => {
    setIsLoading(true);
    setHasFetched(true);
    try {
      const [fetchedRooms, fetchedVibes] = await Promise.all([
        getAllRooms(),
        getAllVibesAdmin()
      ]);
      setSyncOnlineRooms(fetchedRooms);
      setCommonRooms(fetchedVibes);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'An unknown error occurred.' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  const handleDeleteSyncOnlineRoom = async (roomId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms([roomId]);
        if (result.success) {
            toast({ title: "Success", description: `Room deleted.` });
            await handleFetchData();
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
            toast({ title: "Success", description: `Common Room deleted.` });
            await handleFetchData();
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
        <div className="flex justify-between items-center">
          <CardTitle>Room Management</CardTitle>
          <Button onClick={handleFetchData} variant="outline" size="sm" disabled={isLoading}>
            {isLoading ? <LoaderCircle className="animate-spin mr-2" /> : <RefreshCw className="mr-2" />}
            {hasFetched ? 'Refresh Data' : 'Load Rooms Data'}
          </Button>
        </div>
        <CardDescription>
          Manage private Sync Online rooms and public/private Common Rooms (Vibes).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasFetched ? (
          <div className="text-center text-muted-foreground py-10">
            Click the button above to load all room data.
          </div>
        ) : isLoading ? (
          <div className="flex justify-center items-center py-10">
            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h3 className="font-semibold">Sync Online Rooms</h3>
                <ScrollArea className="h-72 border rounded-md p-2">
                    <div className="pr-2 space-y-2">
                    {syncOnlineRooms.length > 0 ? syncOnlineRooms.map(room => (
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
                    )) : <p className="text-center text-sm text-muted-foreground p-4">No Sync Online rooms found.</p>}
                    </div>
                </ScrollArea>
            </div>
            <div className="space-y-4">
                <h3 className="font-semibold">Common Rooms (Vibes)</h3>
                <ScrollArea className="h-72 border rounded-md p-2">
                    <div className="pr-2 space-y-2">
                    {commonRooms.length > 0 ? commonRooms.map(vibe => (
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
                    )) : <p className="text-center text-sm text-muted-foreground p-4">No Common Rooms found.</p>}
                    </div>
                </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
