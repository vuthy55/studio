
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
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
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


export default function RoomsTab() {
  const [syncOnlineRooms, setSyncOnlineRooms] = useState<ClientSyncRoom[]>([]);
  const [commonRooms, setCommonRooms] = useState<ClientVibe[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [user] = useAuthState(auth);

  const fetchRoomsData = useCallback(async () => {
    setIsLoading(true);
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
  
  useEffect(() => {
    fetchRoomsData();
  }, [fetchRoomsData]);

  const handleDeleteSyncOnlineRoom = async (roomId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms([roomId]);
        if (result.success) {
            toast({ title: "Success", description: `Room deleted.` });
            await fetchRoomsData();
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
            await fetchRoomsData();
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Sync Online Rooms</CardTitle>
                     <Button onClick={fetchRoomsData} variant="outline" size="icon" disabled={isLoading}>
                        <RefreshCw className={isLoading ? "animate-spin" : ""} />
                    </Button>
                </div>
                <CardDescription>
                Manage private, real-time translated voice chat rooms.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                     <div className="flex items-center justify-center p-4"> <LoaderCircle className="animate-spin" /></div>
                ) : (
                     <ScrollArea className="h-72">
                         <div className="pr-4 space-y-2">
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
                )}
            </CardContent>
        </Card>
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Common Rooms (Vibes)</CardTitle>
                        <Button onClick={fetchRoomsData} variant="outline" size="icon" disabled={isLoading}>
                           <RefreshCw className={isLoading ? "animate-spin" : ""} />
                        </Button>
                    </div>
                    <CardDescription>
                    Manage public and private community discussion spaces.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                         <div className="flex items-center justify-center p-4"> <LoaderCircle className="animate-spin" /></div>
                    ) : (
                         <ScrollArea className="h-72">
                             <div className="pr-4 space-y-2">
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
                    )}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
