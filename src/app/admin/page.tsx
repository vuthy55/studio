
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, doc, setDoc, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LoaderCircle, Shield, User as UserIcon } from "lucide-react";
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
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const [isFetchingNext, setIsFetchingNext] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchUsers = useCallback(async (loadMore = false) => {
        if (!loadMore) {
            setIsLoading(true);
            setUsers([]);
            setLastVisible(null);
        } else {
            setIsFetchingNext(true);
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
            console.error("Error fetching users. If the console shows a 'permission-denied' or 'failed-precondition' error, you may need to create a Firestore index.", error);
            console.log("FULL FIREBASE ERROR:", error);
            toast({ 
                variant: "destructive", 
                title: "Error Fetching Users", 
                description: "Could not fetch users. Check the browser console for details. You may need to create a Firestore index." 
            });
        } finally {
            setIsLoading(false);
            setIsFetchingNext(false);
        }
    }, [lastVisible, toast]);

    useEffect(() => {
        if (authLoading) {
            return;
        }
        if (!user) {
            router.push('/login');
            return;
        }
        // Initial fetch
        fetchUsers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading, router]);

    const handleRoleChange = async (userId: string, currentRole: 'admin' | 'user') => {
        setIsUpdating(userId);
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        
        if (user?.uid === userId) {
            toast({ variant: "destructive", title: "Action not allowed", description: "You cannot change your own role from this panel."});
            setIsUpdating(null);
            return;
        }

        try {
            const userDocRef = doc(db, 'users', userId);
            await setDoc(userDocRef, { role: newRole }, { merge: true });
            
            setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
            toast({ title: "Success", description: "User role updated." });
        } catch (error: any) {
            console.error("Error updating role:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update user role." });
        } finally {
            setIsUpdating(null);
        }
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
                    <CardDescription>A list of all users in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="hidden sm:table-cell">Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell className="hidden sm:table-cell">{u.name || 'N/A'}</TableCell>
                                    <TableCell className="font-medium">{u.email}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {isUpdating === u.id ? (
                                                 <LoaderCircle className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Switch
                                                    id={`role-switch-${u.id}`}
                                                    checked={u.role === 'admin'}
                                                    onCheckedChange={() => handleRoleChange(u.id, u.role || 'user')}
                                                    disabled={isUpdating === u.id || user?.uid === u.id}
                                                    aria-label={`Toggle admin role for ${u.email}`}
                                                />
                                            )}
                                            <label htmlFor={`role-switch-${u.id}`} className="sr-only">
                                                Toggle admin role for {u.email}
                                            </label>
                                            <div className="hidden sm:block">
                                                {u.role === 'admin' ? 
                                                    <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                                    <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                                }
                                            </div>
                                             <div className="block sm:hidden">
                                                 {u.role === 'admin' ? <Shield className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
