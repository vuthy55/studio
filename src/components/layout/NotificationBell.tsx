
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { Bell, Wifi, Gift, LogOut, Edit, XCircle, ArrowRight, UserPlus, AlertTriangle, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import type { Notification } from '@/lib/types';
import useLocalStorage from '@/hooks/use-local-storage';
import { notificationSound } from '@/lib/sounds';


interface InvitedRoom {
    id: string;
    topic: string;
    createdAt: Timestamp;
}

type DisplayNotification = {
    id: string;
    type: 'invitation' | 'general';
    text: string;
    timestamp: Timestamp;
    read: boolean;
    href: string;
    originalNotification?: Notification;
};

const MAX_NOTIFICATIONS_IN_POPOVER = 5;

export default function NotificationBell() {
    const [user] = useAuthState(auth);
    const [invitations, setInvitations] = useState<InvitedRoom[]>([]);
    const [generalNotifications, setGeneralNotifications] = useState<Notification[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);
    
    const [soundEnabled] = useLocalStorage('notificationSoundEnabled', true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize the Audio object on the client side only
        audioRef.current = new Audio(notificationSound);
    }, []);

    const unreadCount = invitations.length + generalNotifications.filter(n => !n.read).length;
    const prevUnreadCount = useRef(unreadCount);

    useEffect(() => {
        if (unreadCount > prevUnreadCount.current && soundEnabled) {
             audioRef.current?.play().catch(e => console.error("Error playing notification sound:", e));
        }
        prevUnreadCount.current = unreadCount;
    }, [unreadCount, soundEnabled]);
    

    useEffect(() => {
        if (!user || !user.email) {
            setInvitations([]);
            setGeneralNotifications([]);
            return;
        }

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

        const notificationsRef = collection(db, 'notifications');
        const p2pQuery = query(
            notificationsRef,
            where("userId", "==", user.uid)
        );
        const p2pUnsubscribe = onSnapshot(p2pQuery, (snapshot) => {
            const p2pData = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            p2pData.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
            setGeneralNotifications(p2pData);
        }, (error) => {
            console.error("Error fetching notifications:", error);
        });

        return () => {
            roomsUnsubscribe();
            p2pUnsubscribe();
        };

    }, [user]);

    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'p2p_transfer':
                return <Gift className="h-4 w-4 text-primary" />;
            case 'referral_bonus':
                 return <Award className="h-4 w-4 text-amber-500" />;
            case 'buddy_request':
            case 'buddy_request_accepted':
                return <UserPlus className="h-4 w-4 text-blue-500" />;
            case 'buddy_alert':
                 return <AlertTriangle className="h-4 w-4 text-destructive" />;
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
        if (notification.type === 'buddy_alert') {
            const urlMatch = notification.message.match(/https?:\/\/[^\s]+/);
            return urlMatch ? urlMatch[0] : '/notifications';
        }
        switch (notification.type) {
            case 'p2p_transfer':
            case 'referral_bonus':
                return '/profile?tab=wallet';
             case 'buddy_request':
             case 'buddy_request_accepted':
                return '/profile?tab=buddies';
            case 'room_closed':
            case 'room_closed_summary':
            case 'edit_request':
            case 'room_canceled':
                return `/admin?tab=rooms&highlight=${notification.roomId}`;
            default:
                return '/notifications';
        }
    }

    const allNotifications = useMemo((): DisplayNotification[] => {
        const combined: DisplayNotification[] = [];

        generalNotifications.forEach(n => {
            combined.push({
                id: n.id,
                type: 'general',
                text: n.message,
                timestamp: n.createdAt,
                read: n.read,
                href: getNotificationLink(n),
                originalNotification: n
            });
        });

        invitations.forEach(inv => {
            combined.push({
                id: inv.id,
                type: 'invitation',
                text: `You're invited to join "${inv.topic}"`,
                timestamp: inv.createdAt,
                read: false, // Invitations are always "unread" in this context
                href: `/sync-room/${inv.id}`,
            });
        });

        return combined.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
    }, [generalNotifications, invitations]);


    const handleMarkAsRead = async (notificationId: string) => {
        if (!user) return;
        const notifRef = doc(db, 'notifications', notificationId);
        await updateDoc(notifRef, { read: true });
    };

    const handleLinkClick = (notification?: DisplayNotification) => {
        if (notification?.type === 'general' && notification.originalNotification) {
            handleMarkAsRead(notification.originalNotification.id);
        }
        setPopoverOpen(false);
    };

    const hasMoreNotifications = allNotifications.length > MAX_NOTIFICATIONS_IN_POPOVER;
    const notificationsToShow = allNotifications.slice(0, MAX_NOTIFICATIONS_IN_POPOVER);


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
                    {notificationsToShow.length === 0 ? (
                         <p className="text-sm text-center text-muted-foreground py-4">No new notifications.</p>
                    ) : (
                        notificationsToShow.map(n => {
                             const isLink = n.type === 'general' && n.originalNotification?.type === 'buddy_alert';
                             const Wrapper = isLink ? 'a' : Link;
                             const props = isLink 
                                ? { href: n.href, target: '_blank', rel: 'noopener noreferrer' } 
                                : { href: n.href };

                            return (
                                <Wrapper
                                    key={n.id}
                                    {...props}
                                    onClick={() => handleLinkClick(n)}
                                    className={`flex items-start justify-between p-2 -m-2 rounded-md hover:bg-accent hover:text-accent-foreground ${!n.read ? 'font-bold' : ''}`}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {n.type === 'invitation' ? <Wifi className="h-4 w-4 text-primary" /> : getNotificationIcon(n.originalNotification!.type)}
                                            <span className="text-sm whitespace-pre-wrap">{n.text}</span>
                                        </div>
                                    </div>
                                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary mt-1" />}
                                </Wrapper>
                            )
                        })
                    )}
                </div>
                {hasMoreNotifications && (
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
