
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, orderBy, writeBatch } from 'firebase/firestore';
import { LoaderCircle, Bell, Gift, LogOut, Edit, XCircle, Wifi, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { Notification } from '@/lib/types';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsPage() {
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const notificationsRef = collection(db, 'notifications');
        // The query is now simpler and does not require a custom index.
        const q = query(
            notificationsRef,
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            // We sort the notifications on the client side after fetching.
            fetchedNotifications.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
            setNotifications(fetchedNotifications);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching notifications:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, loading, router]);
    
    const handleMarkAllAsRead = async () => {
        if (!user) return;
        const unreadNotifs = notifications.filter(n => !n.read);
        if (unreadNotifs.length === 0) return;
        
        const batch = writeBatch(db);
        unreadNotifs.forEach(notif => {
            const notifRef = doc(db, 'notifications', notif.id);
            batch.update(notifRef, { read: true });
        });
        
        try {
            await batch.commit();
        } catch (error) {
            console.error("Error marking all as read:", error);
        }
    }
    
    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'p2p_transfer':
                return <Gift className="h-5 w-5 text-primary" />;
            case 'buddy_request':
                return <UserPlus className="h-5 w-5 text-blue-500" />;
            case 'room_closed':
            case 'room_closed_summary':
                return <LogOut className="h-5 w-5 text-destructive" />;
             case 'room_canceled':
                return <XCircle className="h-5 w-5 text-destructive" />;
            case 'edit_request':
                 return <Edit className="h-5 w-5 text-blue-500" />;
            default:
                return <Bell className="h-5 w-5" />;
        }
    };

    const getNotificationLink = (notification: Notification) => {
        switch (notification.type) {
            case 'p2p_transfer':
                return '/profile?tab=wallet';
             case 'buddy_request':
                return '/profile?tab=buddies';
            case 'room_closed':
            case 'room_closed_summary':
            case 'edit_request':
            case 'room_canceled':
                return `/admin?tab=rooms&highlight=${notification.roomId}`;
            default:
                return '#';
        }
    }


    if (loading || isLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <MainHeader title="Notifications" description="Your latest updates, invitations, and alerts." />
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>All Notifications</CardTitle>
                        <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={notifications.every(n => n.read)}>
                            Mark all as read
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {notifications.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Bell className="mx-auto h-12 w-12" />
                            <p className="mt-4">You have no notifications yet.</p>
                        </div>
                    ) : (
                        <ul className="space-y-4">
                            {notifications.map(n => (
                                <li key={n.id}>
                                    <Link href={getNotificationLink(n)} className={`block p-4 rounded-lg border transition-colors ${n.read ? 'bg-background hover:bg-muted/50' : 'bg-primary/10 hover:bg-primary/20'}`}>
                                        <div className="flex items-start gap-4">
                                            <div className="mt-1">
                                                {getNotificationIcon(n.type)}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`font-semibold ${!n.read ? 'text-primary-foreground' : 'text-foreground'}`}>{n.message}</p>
                                                {n.fromUserName && (
                                                    <p className="text-sm text-muted-foreground">From: {n.fromUserName}</p>
                                                )}
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })}
                                                {!n.read && <div className="mt-2 flex justify-end"><span className="h-2 w-2 rounded-full bg-primary" /></div>}
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
