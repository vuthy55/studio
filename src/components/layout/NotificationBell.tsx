"use client";

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import { Bell, Wifi, ArrowRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import type { SyncRoom } from '@/lib/types';


interface InvitedRoom extends SyncRoom {
    id: string;
    createdAt: Timestamp;
}

export default function NotificationBell() {
    const [user] = useAuthState(auth);
    const [invitations, setInvitations] = useState<InvitedRoom[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);

    useEffect(() => {
        // If there's no user or email, we should not attempt to listen.
        // We also clear any existing invitations from a previous session.
        if (!user || !user.email) {
            console.log('[DEBUG] NotificationBell: No user, clearing invitations and skipping listener setup.');
            setInvitations([]);
            return;
        }

        console.log(`[DEBUG] NotificationBell: User detected (${user.email}). Setting up listener.`);
        const roomsRef = collection(db, 'syncRooms');
        const q = query(
            roomsRef, 
            where("invitedEmails", "array-contains", user.email),
            where("status", "==", "active")
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            console.log(`[DEBUG] NotificationBell: Snapshot received with ${querySnapshot.docs.length} documents.`);
            const roomsData = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as InvitedRoom))
                .sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });
            
            setInvitations(roomsData);
        }, (error) => {
            console.error("[DEBUG] NotificationBell: Error in onSnapshot listener.", error);
        });

        // The returned unsubscribe function is CRITICAL.
        // It's called when the component unmounts OR when the dependency array (user) changes.
        return () => {
            console.log('[DEBUG] NotificationBell: Cleanup triggered. Unsubscribing from Firestore listener.');
            unsubscribe();
        };

    }, [user]); // The effect correctly depends on the user object.

    const handleLinkClick = () => {
        setPopoverOpen(false);
    };

    return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {invitations.length > 0 && (
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive flex" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Room Invitations</h4>
                        <p className="text-sm text-muted-foreground">
                           You have {invitations.length} pending invitation{invitations.length === 1 ? '' : 's'}.
                        </p>
                    </div>
                     <Separator />
                    <div className="grid gap-2">
                        {invitations.length > 0 ? (
                           invitations.map(room => (
                               <Link
                                    key={room.id}
                                    href={`/sync-room/${room.id}`}
                                    onClick={handleLinkClick}
                                    className="flex items-start justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Wifi className="h-4 w-4 text-primary" />
                                            <span className="font-semibold truncate">{room.topic}</span>
                                        </div>
                                         <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                            <User className="h-3 w-3" />
                                            Invited by {room.creatorName || 'a user'}
                                        </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 mt-1" />
                               </Link>
                           ))
                        ) : (
                            <p className="text-sm text-center text-muted-foreground py-4">No new invitations.</p>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
