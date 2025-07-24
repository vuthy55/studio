
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, LoaderCircle, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import { getReferredUsers, type ReferredUser } from '@/actions/referrals';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { format } from 'date-fns';

function ReferralList() {
    const { user } = useUserData();
    const [referrals, setReferrals] = useState<ReferredUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const handleFetchReferrals = async () => {
        if (!user || hasFetched) return;
        setIsLoading(true);
        try {
            const referredUsers = await getReferredUsers(user.uid);
            setReferrals(referredUsers);
        } catch (error) {
            console.error("Error fetching referrals:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load your referrals.' });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    };
    
    // We don't fetch on mount, we fetch when the tab is clicked.
    // The parent component will call this function.
    // Let's change this to be triggered by the tab change.

    return (
        <CardContent>
            <Button onClick={handleFetchReferrals} disabled={isLoading || hasFetched} variant="outline" className="mb-4">
                {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                {hasFetched ? 'Referrals Loaded' : 'Load My Referrals'}
            </Button>
            
            {isLoading && !hasFetched && (
                 <div className="flex justify-center items-center py-8">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}

            {hasFetched && (
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
                                        <TableCell>{ref.createdAt ? format(new Date(ref.createdAt), 'd MMM yyyy') : 'N/A'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center h-24">You have no referred users yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </CardContent>
    )
}


export default function ReferralLink() {
    const { user } = useUserData();
    const { toast } = useToast();
    const [referralLink, setReferralLink] = useState('');

    useEffect(() => {
        if (user?.uid && typeof window !== 'undefined') {
            setReferralLink(`${window.location.origin}/login?ref=${user.uid}`);
        }
    }, [user]);

    const copyToClipboard = () => {
        if (referralLink) {
            navigator.clipboard.writeText(referralLink);
            toast({ title: "Copied!", description: "Referral link copied to clipboard." });
        }
    };

    if (!user) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Referrals</CardTitle>
                <CardDescription>Share your link to earn token bonuses when your friends sign up.</CardDescription>
            </CardHeader>
            <Tabs defaultValue="link">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="link">Your Link</TabsTrigger>
                    <TabsTrigger value="list">My Referrals</TabsTrigger>
                </TabsList>
                <TabsContent value="link">
                     <CardContent className="space-y-4 pt-6">
                        <div className="flex items-center space-x-2">
                            <Input value={referralLink} readOnly />
                            <Button type="button" size="icon" onClick={copyToClipboard} disabled={!referralLink}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </TabsContent>
                <TabsContent value="list">
                    <ReferralList />
                </TabsContent>
            </Tabs>
        </Card>
    );
}
