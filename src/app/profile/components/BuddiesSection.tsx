
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserData } from '@/context/UserDataContext';
import { useToast } from "@/hooks/use-toast";
import type { UserProfile as UserProfileType, Invitation, FriendRequest } from '@/lib/types';
import { findUserByEmail } from '@/services/ledger';
import { sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend, updateUserBuddyList, sendInvitation, getPendingInvitations } from '@/actions/friends';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoaderCircle, Search, Send, UserPlus, UserCheck, XCircle, UserMinus, RefreshCw, Copy } from "lucide-react";
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';


export default function BuddiesSection() {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfileType | null>(null);
    const [searchedEmailNotFound, setSearchedEmailNotFound] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [friendsDetails, setFriendsDetails] = useState<UserProfileType[]>([]);
    const [activeTab, setActiveTab] = useState('friends');
    const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
    const [isLoadingInvites, setIsLoadingInvites] = useState(false);
    const [hasFetchedInvites, setHasFetchedInvites] = useState(false);

    useEffect(() => {
        const fetchFriendsDetails = async () => {
            if (userProfile?.friends && userProfile.friends.length > 0) {
                const friendsQuery = query(collection(db, 'users'), where('__name__', 'in', userProfile.friends));
                const snapshot = await getDocs(friendsQuery);
                const details = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfileType));
                setFriendsDetails(details);
            } else {
                setFriendsDetails([]);
            }
        };
        fetchFriendsDetails();
    }, [userProfile?.friends]);
    
    const fetchPendingInvites = useCallback(async () => {
        if (!user) return;
        setIsLoadingInvites(true);
        const invites = await getPendingInvitations(user.uid);
        setPendingInvites(invites);
        setIsLoadingInvites(false);
        setHasFetchedInvites(true);
    }, [user]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        setSearchResults(null);
        setSearchedEmailNotFound(null);
        const result = await findUserByEmail(searchTerm);
        if (result) {
            setSearchResults(result as UserProfileType | null);
        } else {
            setSearchedEmailNotFound(searchTerm);
        }
        setIsSearching(false);
    };
    
    const handleInvite = async (email: string) => {
        if (!user || !user.uid) return;
        
        await sendInvitation(user.uid, email);

        const referralLink = `${window.location.origin}/login?ref=${user.uid}`;
        navigator.clipboard.writeText(referralLink);
        toast({ title: "Invite Link Copied!", description: `Share this link with ${email} to have them join VibeSync. A pending invitation has been created.` });
        
        setSearchedEmailNotFound(null);
        setSearchTerm('');
        
        await fetchPendingInvites();
    };

    const handleSendRequest = async (toEmail: string) => {
        if (!user || !user.displayName || !user.email) return;
        const result = await sendFriendRequest({ uid: user.uid, name: user.displayName, email: user.email }, toEmail);
        if (result.success) {
            toast({ title: "Request Sent!", description: `Your friend request to ${toEmail} has been sent.` });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };
    
    const handleAcceptRequest = async (request: FriendRequest) => {
        if (!user || !user.displayName) return;
        const result = await acceptFriendRequest({uid: user.uid, name: user.displayName}, request);
        if (result.success) {
            toast({ title: 'Friend Added!', description: `You are now friends with ${request.fromName}.`});
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };
    
    const handleDeclineRequest = async (request: FriendRequest) => {
        if (!user) return;
        const result = await declineFriendRequest(user.uid, request);
        if (result.success) {
            toast({ title: 'Request Declined' });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };

    const handleRemoveFriend = async (friendId: string) => {
        if (!user) return;
        const result = await removeFriend(user.uid, friendId);
        if (result.success) {
            toast({ title: "Friend Removed" });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };
    
    const handleBuddyToggle = async (friendId: string, isBuddy: boolean) => {
        if (!user) return;
        const result = await updateUserBuddyList(user.uid, friendId, isBuddy);
        if (!result.success) {
             toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    }


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Find New Friends</CardTitle>
                    <CardDescription>
                       Add friends by email. If they're on VibeSync, you can send a friend request. If not, you can invite them to join.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input type="email" placeholder="Enter user's email" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Button type="submit" disabled={isSearching}>{isSearching ? <LoaderCircle className="animate-spin" /> : <Search />}</Button>
                    </form>
                    {searchResults && (
                        <div className="mt-4 p-4 border rounded-lg flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{searchResults.name}</p>
                                <p className="text-sm text-muted-foreground">{searchResults.email}</p>
                            </div>
                            <Button size="sm" onClick={() => handleSendRequest(searchResults.email)}><UserPlus className="mr-2" /> Add Friend</Button>
                        </div>
                    )}
                    {searchedEmailNotFound && (
                        <div className="mt-4 p-4 border rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                             <p className="text-sm text-center sm:text-left">
                                <span className="font-semibold">{searchedEmailNotFound}</span> isn't on VibeSync yet.
                             </p>
                             <Button size="sm" onClick={() => handleInvite(searchedEmailNotFound)}><Send className="mr-2"/> Invite & Copy Link</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="friends">Your Friends ({friendsDetails.length})</TabsTrigger>
                    <TabsTrigger value="invites">Pending Invites ({pendingInvites.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="friends" className="mt-4">
                     <Card>
                        <CardHeader><CardTitle>Manage Connections</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            {userProfile?.friendRequests && userProfile.friendRequests.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="font-semibold mb-2">Incoming Requests ({userProfile.friendRequests.length})</h4>
                                    <div className="space-y-2">
                                        {userProfile.friendRequests.map((req: FriendRequest) => (
                                            <div key={req.fromUid} className="p-3 border rounded-lg flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold">{req.fromName}</p>
                                                    <p className="text-sm text-muted-foreground">{req.fromEmail}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="icon" variant="outline" onClick={() => handleAcceptRequest(req)}><UserCheck className="text-green-600" /></Button>
                                                    <Button size="icon" variant="outline" onClick={() => handleDeclineRequest(req)}><XCircle className="text-red-600" /></Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <Separator className="my-4"/>
                                </div>
                            )}

                            {friendsDetails.length > 0 ? friendsDetails.map(friend => (
                                <div key={friend.id} className="p-3 border rounded-lg flex justify-between items-center">
                                    <div className="flex-1">
                                        <p className="font-semibold">{friend.name}</p>
                                        <p className="text-sm text-muted-foreground">{friend.email}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                         <div className="flex items-center gap-2">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Label htmlFor={`buddy-toggle-${friend.id}`} className="text-xs text-muted-foreground cursor-pointer">Buddy Alert</Label>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Enable to include this friend in emergency Buddy Alerts.</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <Switch
                                                id={`buddy-toggle-${friend.id}`}
                                                checked={userProfile?.buddies?.includes(friend.id!)}
                                                onCheckedChange={(checked) => handleBuddyToggle(friend.id!, checked)}
                                            />
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="icon" variant="ghost"><UserMinus className="text-destructive" /></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove {friend.name}?</AlertDialogTitle>
                                                    <AlertDialogDescription>This will remove them from your friends list and buddy list. This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleRemoveFriend(friend.id!)}>Confirm</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            )) : <p className="text-muted-foreground text-center py-4">You haven't added any friends yet.</p>}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="invites" className="mt-4">
                     <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Pending Invitations</CardTitle>
                                <Button variant="outline" size="sm" onClick={fetchPendingInvites} disabled={isLoadingInvites}>
                                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingInvites && "animate-spin")} />
                                    {hasFetchedInvites ? 'Refresh' : 'Load Invites'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingInvites ? <div className="flex justify-center py-4"><LoaderCircle className="animate-spin" /></div> : (
                                hasFetchedInvites ? (
                                    pendingInvites.length > 0 ? (
                                        <div className="space-y-2">
                                            {pendingInvites.map(invite => (
                                                <div key={invite.id} className="p-3 border rounded-lg flex justify-between items-center">
                                                    <div>
                                                        <p className="font-semibold">{invite.invitedEmail}</p>
                                                        <p className="text-xs text-muted-foreground">Invited {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}</p>
                                                    </div>
                                                    <Button size="sm" variant="outline" onClick={() => handleInvite(invite.invitedEmail)}><Copy className="mr-2"/> Re-copy Link</Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-muted-foreground text-center py-4">You have no pending invitations.</p>
                                ) : <p className="text-muted-foreground text-center py-4">Click the button to load your pending invitations.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

        </div>
    )
}
