
"use client";

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { Bell, Wifi, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import type { SyncRoom, P2PNotification } from '@/lib/types';


interface InvitedRoom extends SyncRoom {
    id: string;
    createdAt: Timestamp;
}

export default function NotificationBell() {
    const [user] = useAuthState(auth);
    const [invitations, setInvitations] = useState<InvitedRoom[]>([]);
    const [p2pNotifications, setP2PNotifications] = useState<P2PNotification[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);
    
    const unreadCount = invitations.length + p2pNotifications.filter(n => !n.read).length;

    useEffect(() => {
        if (!user || !user.email) {
            setInvitations([]);
            setP2PNotifications([]);
            return;
        }

        // Listener for Room Invitations
        const roomsRef = collection(db, 'syncRooms');
        const roomsQuery = query(
            roomsRef, 
            where("invitedEmails", "array-contains", user.email),
            where("status", "==", "active")
        );
        const roomsUnsubscribe = onSnapshot(roomsQuery, (snapshot) => {
            const roomsData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as InvitedRoom))
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setInvitations(roomsData);
        });

        // Listener for P2P Transfer Notifications
        const notificationsRef = collection(db, 'notifications');
        // REMOVED ORDERBY TO PREVENT INDEXING ERROR, SORTING IS DONE ON CLIENT
        const p2pQuery = query(
            notificationsRef,
            where("userId", "==", user.uid),
            limit(10) // Limit to the last 10 notifications
        );
        const p2pUnsubscribe = onSnapshot(p2pQuery, (snapshot) => {
            const p2pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as P2PNotification))
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setP2PNotifications(p2pData);
        });

        return () => {
            roomsUnsubscribe();
            p2pUnsubscribe();
        };

    }, [user]);

    const handleMarkAsRead = async (notificationId: string) => {
        if (!user) return;
        const notifRef = doc(db, 'notifications', notificationId);
        await updateDoc(notifRef, { read: true });
    };

    const handleLinkClick = (notificationId?: string) => {
        if (notificationId) {
            handleMarkAsRead(notificationId);
        }
        setPopoverOpen(false);
    };

    return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive flex" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Notifications</h4>
                        <p className="text-sm text-muted-foreground">
                           You have {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}.
                        </p>
                    </div>
                     <Separator />
                    <div className="grid gap-2">
                        {invitations.length === 0 && p2pNotifications.length === 0 ? (
                             <p className="text-sm text-center text-muted-foreground py-4">No new notifications.</p>
                        ) : (
                            <>
                                {p2pNotifications.map(n => (
                                     <Link
                                        key={n.id}
                                        href="/profile?tab=history"
                                        onClick={() => handleLinkClick(n.id)}
                                        className={`flex items-start justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground ${!n.read ? 'font-bold' : ''}`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Gift className="h-4 w-4 text-primary" />
                                                <span>{`You received ${n.amount} tokens!`}</span>
                                            </div>
                                             <p className={`text-xs mt-1 ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                From {n.fromUserName || 'a user'}
                                            </p>
                                        </div>
                                         {!n.read && <span className="h-2 w-2 rounded-full bg-primary mt-1" />}
                                    </Link>
                                ))}
                                {invitations.map(room => (
                                   <Link
                                        key={room.id}
                                        href={`/sync-room/${room.id}`}
                                        onClick={() => handleLinkClick()}
                                        className="flex items-start justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground font-bold"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Wifi className="h-4 w-4 text-primary" />
                                                <span className="truncate">{room.topic}</span>
                                            </div>
                                             <p className="text-xs text-muted-foreground mt-1">
                                                Room Invitation
                                            </p>
                                        </div>
                                         <span className="h-2 w-2 rounded-full bg-primary mt-1" />
                                   </Link>
                               ))}
                            </>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
