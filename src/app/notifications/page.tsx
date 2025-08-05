
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, orderBy, writeBatch } from 'firebase/firestore';
import { LoaderCircle, Bell, Gift, LogOut, Edit, XCircle, Wifi, UserPlus, AlertTriangle, Award, Trash2, MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { deleteNotifications } from '@/actions/admin';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


import type { Notification } from '@/lib/types';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsPage() {
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const notificationsRef = collection(db, 'notifications');
        // The query is simplified to only filter by userId. Sorting is handled on the client.
        const q = query(
            notificationsRef,
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            // Sort the notifications by date here on the client-side
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
    
    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        if (checked) {
            setSelectedIds(notifications.map(n => n.id));
        } else {
            setSelectedIds([]);
        }
    };
    
    const handleSelectOne = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        }
    };

    const handleDeleteSelected = async () => {
        setIsDeleting(true);
        const result = await deleteNotifications(selectedIds);
        if (result.success) {
            toast({ title: 'Success', description: `${selectedIds.length} notification(s) deleted.` });
            setSelectedIds([]);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete notifications.' });
        }
        setIsDeleting(false);
    };
    
    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'p2p_transfer':
                return <Gift className="h-5 w-5 text-primary" />;
            case 'referral_bonus':
                return <Award className="h-5 w-5 text-amber-500" />;
            case 'buddy_request':
            case 'friend_request':
            case 'friend_request_accepted':
                return <UserPlus className="h-5 w-5 text-blue-500" />;
            case 'buddy_alert':
                 return <AlertTriangle className="h-5 w-5 text-destructive" />;
            case 'room_closed':
            case 'room_closed_summary':
                return <LogOut className="h-5 w-5 text-destructive" />;
             case 'room_canceled':
                return <XCircle className="h-5 w-5 text-destructive" />;
            case 'edit_request':
                 return <Edit className="h-5 w-5 text-blue-500" />;
            case 'vibe_invite':
                return <MessagesSquare className="h-5 w-5 text-indigo-500" />;
            case 'room_invite':
                return <Wifi className="h-5 w-5 text-primary" />;
            default:
                return <Bell className="h-5 w-5" />;
        }
    };

    const getNotificationLink = (notification: Notification) => {
        if (notification.type === 'buddy_alert') {
            const urlMatch = notification.message.match(/https?:\/\/[^\s]+/);
            return urlMatch ? { href: urlMatch[0], isExternal: true } : { href: '#', isExternal: false };
        }
        switch (notification.type) {
            case 'p2p_transfer':
            case 'referral_bonus':
                return { href: '/profile?tab=wallet', isExternal: false };
             case 'buddy_request':
             case 'friend_request_accepted':
                return { href: '/profile?tab=buddies', isExternal: false };
            case 'room_closed':
            case 'room_closed_summary':
            case 'edit_request':
            case 'room_canceled':
                return { href: `/admin?tab=rooms&highlight=${notification.roomId}`, isExternal: false };
            case 'room_invite':
                return { href: `/sync-room/${notification.roomId}`, isExternal: false };
            case 'vibe_invite':
                return { href: `/common-room/${notification.vibeId}`, isExternal: false };
            default:
                return { href: '#', isExternal: false };
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
                        <div>
                             <CardTitle>All Notifications</CardTitle>
                             <CardDescription>All your alerts will appear here.</CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            {selectedIds.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" disabled={isDeleting}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete ({selectedIds.length})
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete the selected {selectedIds.length} notification(s). This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteSelected} disabled={isDeleting}>
                                                {isDeleting && <LoaderCircle className="animate-spin mr-2"/>}
                                                Confirm Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={notifications.every(n => n.read)}>
                                Mark all as read
                            </Button>
                        </div>
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
                            <li className="flex items-center p-2">
                                <Checkbox
                                    id="select-all"
                                    onCheckedChange={handleSelectAll}
                                    checked={selectedIds.length === notifications.length && notifications.length > 0}
                                    aria-label="Select all notifications"
                                />
                                <label htmlFor="select-all" className="ml-3 text-sm font-medium">
                                    Select All
                                </label>
                            </li>
                            {notifications.map(n => {
                                const { href, isExternal } = getNotificationLink(n);
                                const Wrapper = isExternal ? 'a' : Link;
                                const props = isExternal ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href };

                                return (
                                <li key={n.id} className="flex items-center gap-4 p-4 rounded-lg border transition-colors bg-background hover:bg-muted/50 has-[:checked]:bg-primary/10">
                                    <Checkbox
                                        id={n.id}
                                        onCheckedChange={(checked) => handleSelectOne(n.id, !!checked)}
                                        checked={selectedIds.includes(n.id)}
                                    />
                                    <Wrapper {...props} className="block w-full">
                                        <div className="flex items-start gap-4">
                                            <div className="mt-1">
                                                {getNotificationIcon(n.type)}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`font-semibold ${!n.read ? 'text-primary-foreground' : 'text-foreground'} whitespace-pre-wrap`}>{n.message}</p>
                                                {n.fromUserName && (
                                                    <p className="text-sm text-muted-foreground">From: {n.fromUserName}</p>
                                                )}
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })}
                                                {!n.read && <div className="mt-2 flex justify-end"><span className="h-2 w-2 rounded-full bg-primary" /></div>}
                                            </div>
                                        </div>
                                    </Wrapper>
                                </li>
                            )})}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
