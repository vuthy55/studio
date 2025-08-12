"use client";

import React, { useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoaderCircle, Shield, User as UserIcon, ArrowRight, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface UserWithId extends UserProfile {
    id: string;
}

export default function UsersTab() {
    const router = useRouter();
    const [users, setUsers] = useState<UserWithId[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

     const fetchUsers = useCallback(async (search = '') => {
        const trimmedSearch = search.trim();
        const normalizedSearch = trimmedSearch.toLowerCase();

        if (!trimmedSearch) {
            setUsers([]);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        setHasSearched(true);
        
        try {
            const usersRef = collection(db, 'users');
            let combinedUsers: UserWithId[] = [];

            if (trimmedSearch === '*') {
                // Wildcard search: fetch all users
                const allUsersQuery = query(usersRef, orderBy('email'));
                const allUsersSnapshot = await getDocs(allUsersQuery);
                combinedUsers = allUsersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
            } else {
                // Standard search by name or email
                const emailQuery = query(usersRef, 
                    where("searchableEmail", ">=", normalizedSearch),
                    where("searchableEmail", "<=", normalizedSearch + '\uf8ff')
                );
                
                const nameQuery = query(usersRef,
                    where("searchableName", ">=", normalizedSearch),
                    where("searchableName", "<=", normalizedSearch + '\uf8ff')
                );
                
                const [emailSnapshot, nameSnapshot] = await Promise.all([
                    getDocs(emailQuery),
                    getDocs(nameQuery),
                ]);

                const foundUsersMap = new Map<string, UserWithId>();

                const processSnapshot = (snapshot: any) => {
                    snapshot.docs.forEach((doc: any) => {
                        if (!foundUsersMap.has(doc.id)) {
                            foundUsersMap.set(doc.id, { id: doc.id, ...doc.data() } as UserWithId);
                        }
                    });
                }

                processSnapshot(emailSnapshot);
                processSnapshot(nameSnapshot);
                
                combinedUsers = Array.from(foundUsersMap.values());
            }

            setUsers(combinedUsers);

        } catch (error: any) {
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                
            } else {
                 toast({ 
                    variant: "destructive", 
                    title: "Error Fetching Users", 
                    description: "Could not fetch users. Check the console for details." 
                });
            }
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const handleRowClick = (userId: string) => {
        router.push(`/admin/${userId}`);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchUsers(searchTerm);
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Search by name/email, or use '*' to show all users.</CardDescription>
                 <form className="relative pt-2 flex gap-2" onSubmit={handleSearch}>
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, email, or use * for all"
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                     <Button type="submit" disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="animate-spin" /> : 'Search'}
                    </Button>
                </form>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md min-h-[200px]">
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
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                         <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : users.length > 0 ? (
                                users.map((u) => (
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
                                ))
                             ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        {hasSearched ? 'No users found.' : 'Enter a search term to begin.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
