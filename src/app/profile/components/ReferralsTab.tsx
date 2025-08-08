
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { getReferredUsers, type ReferredUser } from '@/actions/referrals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoaderCircle, Copy, Users as UsersIcon, RefreshCw } from "lucide-react";

export default function ReferralsTab() {
    const { user } = useUserData();
    const { toast } = useToast();
    const [referralLink, setReferralLink] = useState('');
    const [referrals, setReferrals] = useState<ReferredUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    
    useEffect(() => {
        if (user?.uid && typeof window !== 'undefined') {
            setReferralLink(`${window.location.origin}/login?ref=${user.uid}`);
        }
    }, [user?.uid]);

    const copyReferralLink = () => {
        if (referralLink) {
            navigator.clipboard.writeText(referralLink);
            toast({ title: "Copied!", description: "Referral link copied to clipboard." });
        }
    };

    const fetchReferrals = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setHasFetched(true);
        try {
            const referredUsers = await getReferredUsers(user.uid);
            const sortedUsers = referredUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setReferrals(sortedUsers);
        } catch (error) {
            console.error("Error fetching referrals:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load your referrals.' });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Your Referral Link</CardTitle>
                    <CardDescription>Share this link with friends. When they sign up, you'll get a token bonus!</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2">
                        <Input value={referralLink} readOnly />
                        <Button type="button" size="icon" onClick={copyReferralLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2"><UsersIcon /> Referred Users</CardTitle>
                            <CardDescription>A list of users who have signed up using your link.</CardDescription>
                        </div>
                         <Button onClick={fetchReferrals} variant="outline" size="sm" disabled={isLoading}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            {hasFetched ? 'Refresh' : 'Load Referrals'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8">
                            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : hasFetched ? (
                        <div className="border rounded-md min-h-[200px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Date Joined</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {referrals.length > 0 ? (
                                        referrals.map(ref => (
                                            <TableRow key={ref.id}>
                                                <TableCell>{ref.name || 'N/A'}</TableCell>
                                                <TableCell>{ref.email}</TableCell>
                                                <TableCell>{ref.createdAt ? format(new Date(ref.createdAt), 'd MMM yyyy, HH:mm') : 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">No one has signed up with your link yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Click the button to load your referral history.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
