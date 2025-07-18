
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, doc, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { LoaderCircle, Shield, User as UserIcon, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

interface UserWithId extends UserProfile {
    id: string;
}

const USERS_PER_PAGE = 20;

export default function AdminPage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    const { isMobile } = useSidebar();

    const [users, setUsers] = useState<UserWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [isFetchingNext, setIsFetchingNext] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchUsers = useCallback(async (loadMore = false) => {
        if (!user) return;
        
        if (loadMore) {
            setIsFetchingNext(true);
        } else {
            setIsLoading(true);
            setUsers([]);
            setLastVisible(null);
        }
        
        try {
            const usersRef = collection(db, 'users');
            let q;

            if (loadMore && lastVisible) {
                 q = query(usersRef, orderBy("email"), startAfter(lastVisible), limit(USERS_PER_PAGE));
            } else {
                 q = query(usersRef, orderBy("email"), limit(USERS_PER_PAGE));
            }
            
            const querySnapshot = await getDocs(q);
            
            const fetchedUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
            const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

            setLastVisible(lastDoc || null);
            setHasMore(querySnapshot.docs.length === USERS_PER_PAGE);
            
            if (loadMore) {
                setUsers(prev => [...prev, ...fetchedUsers]);
            } else {
                setUsers(fetchedUsers);
            }

        } catch (error: any) {
            console.error("Error fetching users:", error);
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required for this query. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                console.error("FULL FIREBASE ERROR - You probably need to create an index. Look for a URL in this error message to create it automatically:", error);
            } else {
                 toast({ 
                    variant: "destructive", 
                    title: "Error Fetching Users", 
                    description: "Could not fetch users. Check the console for details." 
                });
            }
        } finally {
            setIsLoading(false);
            setIsFetchingNext(false);
        }
    }, [user, lastVisible, toast]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }
        fetchUsers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading, router]);

    const handleRowClick = (userId: string) => {
        router.push(`/admin/${userId}`);
    };
    
    if (authLoading || isLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <header className="flex items-center gap-4">
                {isMobile && <SidebarTrigger />}
                <div>
                  <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
                  <p className="text-muted-foreground">Manage users and app settings.</p>
                </div>
            </header>
            
            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>A list of all users in the system. Click a user to view and edit their details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="hidden sm:table-cell">Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u) => (
                                    <TableRow key={u.id} onClick={() => handleRowClick(u.id)} className="cursor-pointer">
                                        <TableCell className="hidden sm:table-cell font-medium">{u.name || 'N/A'}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>
                                            {u.role === 'admin' ? 
                                                <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                                <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {users.length === 0 && !isLoading && (
                        <p className="text-center text-muted-foreground py-8">No users found.</p>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-center">
                {hasMore && (
                     <Button onClick={() => fetchUsers(true)} disabled={isFetchingNext}>
                        {isFetchingNext ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Load More
                    </Button>
                )}
            </div>
        </div>
    );
}
