
"use client";

import React, { useState, useCallback } from 'react';
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
import { getAllVibesAdmin, deleteVibesAdmin, getArchivedVibesAdmin } from '@/actions/common-room-admin';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { permanentlyDeleteRooms } from '@/actions/room';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


function ArchivedVibesManager() {
  const [archivedVibes, setArchivedVibes] = useState<ClientVibe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleFetchArchived = async () => {
    setIsLoading(true);
    setHasFetched(true);
    try {
      const vibes = await getArchivedVibesAdmin();
      setArchivedVibes(vibes);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch archived vibes.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (vibeIds: string[]) => {
    if (vibeIds.length === 0) return;
    setIsDeleting(true);
    try {
      const result = await deleteVibesAdmin(vibeIds);
      if (result.success) {
        toast({ title: 'Success', description: `${vibeIds.length} vibe(s) deleted.` });
        await handleFetchArchived(); // Refresh the list
        setSelectedIds([]);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete vibe(s).' });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
        setSelectedIds(archivedVibes.map(v => v.id));
    } else {
        setSelectedIds([]);
    }
  }

  return (
    <Card className="mt-6 border-amber-500/40">
      <CardHeader>
        <CardTitle>Archived Common Rooms</CardTitle>
        <CardDescription>
          Manage inactive community discussion spaces. These are vibes with no activity for a period defined in your App Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
            <Button onClick={handleFetchArchived} disabled={isLoading}>
                {isLoading ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
                {hasFetched ? 'Refresh Archived List' : 'Fetch Archived Vibes'}
            </Button>
            {selectedIds.length > 0 && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="destructive" disabled={isDeleting}>
                            {isDeleting ? <LoaderCircle className="animate-spin mr-2" /> : <Trash2 className="mr-2" />}
                            Delete Selected ({selectedIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete {selectedIds.length} vibe(s) and all their associated posts and meetups. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(selectedIds)}>
                                Confirm Deletion
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
        
        {hasFetched && !isLoading && (
            <ScrollArea className="h-72">
                <div className="pr-4 space-y-2">
                    {archivedVibes.length > 0 ? (
                        <>
                         <div className="flex items-center p-2">
                            <Checkbox 
                                id="select-all-archived" 
                                onCheckedChange={handleSelectAll}
                                checked={archivedVibes.length > 0 && selectedIds.length === archivedVibes.length}
                            />
                            <label htmlFor="select-all-archived" className="ml-2 font-medium">Select All</label>
                        </div>
                        {archivedVibes.map(vibe => (
                            <div key={vibe.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                <div className="flex items-center gap-2">
                                     <Checkbox 
                                        id={`select-${vibe.id}`} 
                                        onCheckedChange={(checked) => {
                                            setSelectedIds(prev => checked ? [...prev, vibe.id] : prev.filter(id => id !== vibe.id));
                                        }}
                                        checked={selectedIds.includes(vibe.id)}
                                    />
                                    <div>
                                        <p className="font-semibold">{vibe.topic}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Last active: {vibe.lastPostAt ? formatDistanceToNow(new Date(vibe.lastPostAt), { addSuffix: true }) : 'never'}
                                        </p>
                                    </div>
                                </div>
                                 <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="icon" variant="ghost" disabled={isDeleting}>
                                            <Trash2 className="h-4 w-4 text-destructive"/>
                                        </Button>
                                    </AlertDialogTrigger>
                                     <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete "{vibe.topic}"?</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently delete this vibe and all its content. This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete([vibe.id])}>
                                                Confirm Deletion
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                         ))}
                         </>
                    ) : <p className="text-center text-sm text-muted-foreground p-4">No archived vibes found.</p>}
                </div>
            </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}


export default function RoomsTab() {
  const [syncOnlineRooms, setSyncOnlineRooms] = useState<ClientSyncRoom[]>([]);
  const [commonRooms, setCommonRooms] = useState<ClientVibe[]>([]);
  
  const [isLoadingSyncOnline, setIsLoadingSyncOnline] = useState(false);
  const [isLoadingCommonRooms, setIsLoadingCommonRooms] = useState(false);
  const [hasFetchedSyncOnline, setHasFetchedSyncOnline] = useState(false);
  const [hasFetchedCommonRooms, setHasFetchedCommonRooms] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [user] = useAuthState(auth);

  const handleFetchSyncOnline = useCallback(async () => {
    setIsLoadingSyncOnline(true);
    setHasFetchedSyncOnline(true);
    try {
      const fetchedRooms = await getAllRooms();
      setSyncOnlineRooms(fetchedRooms);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'An unknown error occurred.' });
    } finally {
      setIsLoadingSyncOnline(false);
    }
  }, [toast]);
  
  const handleFetchCommonRooms = useCallback(async () => {
    setIsLoadingCommonRooms(true);
    setHasFetchedCommonRooms(true);
    try {
        const fetchedVibes = await getAllVibesAdmin();
        setCommonRooms(fetchedVibes);
    } catch (e: any) {
         toast({ variant: 'destructive', title: 'Error', description: e.message || 'An unknown error occurred.' });
    } finally {
        setIsLoadingCommonRooms(false);
    }
  }, [toast]);

  const handleDeleteSyncOnlineRoom = async (roomId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await permanentlyDeleteRooms([roomId]);
        if (result.success) {
            toast({ title: "Success", description: `Room deleted.` });
            await handleFetchSyncOnline();
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
            await handleFetchCommonRooms();
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
                <CardTitle>Sync Online Rooms</CardTitle>
                <CardDescription>
                Manage private, real-time translated voice chat rooms.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={handleFetchSyncOnline} disabled={isLoadingSyncOnline}>
                    {isLoadingSyncOnline ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
                    {hasFetchedSyncOnline ? 'Refresh List' : 'Fetch Sync Online Rooms'}
                </Button>
                {isLoadingSyncOnline ? (
                     <div className="flex items-center justify-center p-4"> <LoaderCircle className="animate-spin" /></div>
                ) : hasFetchedSyncOnline && (
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
                    <CardTitle>Active Common Rooms</CardTitle>
                    <CardDescription>
                    Manage public and private community discussion spaces (Vibes).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Button onClick={handleFetchCommonRooms} disabled={isLoadingCommonRooms}>
                        {isLoadingCommonRooms ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
                        {hasFetchedCommonRooms ? 'Refresh List' : 'Fetch Common Rooms'}
                    </Button>
                    {isLoadingCommonRooms ? (
                         <div className="flex items-center justify-center p-4"> <LoaderCircle className="animate-spin" /></div>
                    ) : hasFetchedCommonRooms && (
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
            <ArchivedVibesManager />
        </div>
    </div>
  );
}
