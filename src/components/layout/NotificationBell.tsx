
"use client";

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Bell, Wifi, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Separator } from '../ui/separator';

interface InvitedRoom {
    id: string;
    topic: string;
    createdAt: Timestamp;
}

export default function NotificationBell() {
    const [user] = useAuthState(auth);
    const [invitations, setInvitations] = useState<InvitedRoom[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);

    useEffect(() => {
        if (!user || !user.email) {
            setInvitations([]);
            return;
        }

        const roomsRef = collection(db, 'syncRooms');
        const q = query(
            roomsRef, 
            where("invitedEmails", "array-contains", user.email),
            where("status", "==", "active")
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const rooms = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as InvitedRoom))
                .sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });
            setInvitations(rooms);
        }, (error) => {
            console.error("Error fetching invitations:", error);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();

    }, [user]);

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
                                    className="flex items-center justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground"
                                >
                                    <div className="flex items-center gap-2">
                                        <Wifi className="h-4 w-4 text-primary" />
                                        <span className="font-semibold truncate">{room.topic}</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4" />
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
