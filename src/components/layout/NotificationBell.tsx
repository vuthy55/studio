
"use client";

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { Bell, Wifi, Gift, LogOut, Edit, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import type { Notification } from '@/lib/types';


interface InvitedRoom {
    id: string;
    topic: string;
    createdAt: Timestamp;
}

const MAX_NOTIFICATIONS_IN_POPOVER = 5;

export default function NotificationBell() {
    const [user] = useAuthState(auth);
    const [invitations, setInvitations] = useState<InvitedRoom[]>([]);
    const [generalNotifications, setGeneralNotifications] = useState<Notification[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);
    
    const unreadCount = invitations.length + generalNotifications.filter(n => !n.read).length;
    const hasMoreNotifications = generalNotifications.length > MAX_NOTIFICATIONS_IN_POPOVER;

    useEffect(() => {
        if (!user || !user.email) {
            setInvitations([]);
            setGeneralNotifications([]);
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
                .map(doc => ({ id: doc.id, topic: doc.data().topic, createdAt: doc.data().createdAt } as InvitedRoom))
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setInvitations(roomsData);
        });

        // Listener for General Notifications (P2P, Admin, etc.) - Fetching more to determine if "View all" is needed
        const notificationsRef = collection(db, 'notifications');
        const p2pQuery = query(
            notificationsRef,
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(20) 
        );
        const p2pUnsubscribe = onSnapshot(p2pQuery, (snapshot) => {
            const p2pData = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            setGeneralNotifications(p2pData);
        }, (error) => {
            console.error("Error fetching notifications:", error);
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

    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'p2p_transfer':
                return <Gift className="h-4 w-4 text-primary" />;
            case 'room_closed':
            case 'room_closed_summary':
                return <LogOut className="h-4 w-4 text-destructive" />;
             case 'room_canceled':
                return <XCircle className="h-4 w-4 text-destructive" />;
            case 'edit_request':
                 return <Edit className="h-4 w-4 text-blue-500" />;
            default:
                return <Bell className="h-4 w-4" />;
        }
    };

    const getNotificationLink = (notification: Notification) => {
        switch (notification.type) {
            case 'p2p_transfer':
                return '/profile?tab=tokens';
            case 'room_closed':
            case 'room_closed_summary':
            case 'edit_request':
            case 'room_canceled':
                return `/admin?tab=rooms&highlight=${notification.roomId}`;
            default:
                return '#';
        }
    }


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
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <h4 className="font-medium leading-none">Notifications</h4>
                        <p className="text-sm text-muted-foreground">
                           You have {unreadCount} unread message{unreadCount === 1 ? '' : 's'}.
                        </p>
                    </div>
                </div>
                 <Separator className="my-2" />
                <div className="grid gap-2">
                    {invitations.length === 0 && generalNotifications.length === 0 ? (
                         <p className="text-sm text-center text-muted-foreground py-4">No new notifications.</p>
                    ) : (
                        <>
                            {generalNotifications.slice(0, MAX_NOTIFICATIONS_IN_POPOVER).map(n => (
                                 <Link
                                    key={n.id}
                                    href={getNotificationLink(n)}
                                    onClick={() => handleLinkClick(n.id)}
                                    className={`flex items-start justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground ${!n.read ? 'font-bold' : ''}`}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {getNotificationIcon(n.type)}
                                            <span>{n.message}</span>
                                        </div>
                                         {n.fromUserName && (
                                            <p className={`text-xs mt-1 ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                From {n.fromUserName}
                                            </p>
                                         )}
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
                {(hasMoreNotifications || invitations.length > 0) && (
                     <>
                        <Separator className="my-2" />
                        <Button variant="ghost" className="w-full justify-center h-8" asChild>
                            <Link href="/notifications" onClick={() => setPopoverOpen(false)}>
                                View all notifications
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
