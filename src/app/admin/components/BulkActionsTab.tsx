
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/lib/types';
import { LoaderCircle, Shield, User as UserIcon, Trash2, BellOff, AlertTriangle } from "lucide-react";
import { clearAllNotifications, deleteUsers } from '@/actions/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface UserWithId extends UserProfile {
    id: string;
}

function BulkDeleteUsers() {
    const [currentUser] = useAuthState(auth);
    const { toast } = useToast();
    const [users, setUsers] = useState<UserWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [confirmationText, setConfirmationText] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const fetchAllUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, orderBy('email'));
            const snapshot = await getDocs(q);
            const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserWithId));
            setUsers(allUsers);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch users.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchAllUsers();
    }, [fetchAllUsers]);

    const handleSelectUser = (userId: string, checked: boolean) => {
        setSelectedUserIds(prev => 
            checked ? [...prev, userId] : prev.filter(id => id !== userId)
        );
    };

    const handleSelectAll = (checked: boolean) => {
        // Prevent admin from deselecting themselves if they are the only one left
        const nonAdminUsers = users.filter(u => u.id !== currentUser?.uid);
        if (checked) {
            setSelectedUserIds(users.map(u => u.id));
        } else {
             setSelectedUserIds(selectedUserIds.filter(id => id === currentUser?.uid));
        }
    };
    
    const handleDelete = async () => {
        if (confirmationText !== 'permanently delete') {
            toast({ variant: 'destructive', title: 'Confirmation failed', description: 'Please type the confirmation phrase exactly.'});
            return;
        }

        setIsDeleting(true);
        const result = await deleteUsers(selectedUserIds);
        if (result.success) {
            toast({ title: 'Success', description: `${selectedUserIds.length} user(s) have been permanently deleted.`});
            setSelectedUserIds([]);
            setConfirmationText('');
            setIsConfirmOpen(false);
            await fetchAllUsers();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete users.' });
        }
        setIsDeleting(false);
    };

    return (
        <div className="p-4 space-y-4">
             <div className="flex justify-end">
                <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={selectedUserIds.length === 0 || isDeleting}>
                            {isDeleting ? <LoaderCircle className="animate-spin mr-2" /> : <Trash2 className="mr-2" />}
                            Delete Selected ({selectedUserIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete {selectedUserIds.length} user(s) and all their associated data, including transaction history and authentication accounts. This action cannot be undone.
                                <br/><br/>
                                Please type <strong className="text-destructive">permanently delete</strong> to confirm.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input 
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="permanently delete"
                        />
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={handleDelete}
                                disabled={isDeleting || confirmationText !== 'permanently delete'}
                            >
                                 {isDeleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Deletion
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <Checkbox 
                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                    checked={users.length > 0 && selectedUserIds.length === users.length}
                                    aria-label="Select all"
                                />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
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
                            users.map((user) => (
                                <TableRow key={user.id} data-state={selectedUserIds.includes(user.id) && "selected"}>
                                    <TableCell>
                                        <Checkbox
                                            onCheckedChange={(checked) => handleSelectUser(user.id, !!checked)}
                                            checked={selectedUserIds.includes(user.id)}
                                            aria-label={`Select user ${user.name}`}
                                            disabled={user.id === currentUser?.uid && user.role === 'admin'}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        {user.role === 'admin' ? 
                                            <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                            <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                        }
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}


export default function BulkActionsTab() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [clearNotificationsOpen, setClearNotificationsOpen] = useState(false);

    const handleClearNotifications = async () => {
        setIsLoading(true);
        const result = await clearAllNotifications();
        if (result.success) {
            toast({ title: "Success", description: "All notification data has been cleared." });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not clear notification data.' });
        }
        setIsLoading(false);
        setClearNotificationsOpen(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> Bulk Data Management</CardTitle>
                <CardDescription>
                    Perform system-wide data clearing actions. These are irreversible and should be used with extreme caution.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="bulk-delete-users">
                        <AccordionTrigger>Bulk Delete Users</AccordionTrigger>
                        <AccordionContent>
                           <BulkDeleteUsers />
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="clear-notifications">
                        <AccordionTrigger>Clear All Notifications</AccordionTrigger>
                        <AccordionContent>
                            <div className="p-4 space-y-4">
                                <p className="text-sm text-muted-foreground">This will permanently delete all records from the `notifications` collection for all users. This action is irreversible.</p>
                                <AlertDialog open={clearNotificationsOpen} onOpenChange={setClearNotificationsOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={isLoading}>
                                            <BellOff className="mr-2" />
                                            {isLoading ? 'Clearing...' : 'Clear All Notifications'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all notifications for every user in the system. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleClearNotifications} disabled={isLoading}>
                                                {isLoading && <LoaderCircle className="animate-spin mr-2" />}
                                                Confirm &amp; Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    )
}
