
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoaderCircle, CreditCard, Heart, RefreshCw } from "lucide-react";
import type { PaymentLog } from '@/lib/types';


export default function BillingTab() {
    const [user] = useAuthState(auth);
    const [payments, setPayments] = useState<PaymentLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchPaymentHistory = useCallback(async () => {
        if (!user || hasFetched) return;
        setIsLoading(true);
        try {
            const paymentsRef = collection(db, 'users', user.uid, 'paymentHistory');
            const q = query(paymentsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => doc.data() as PaymentLog);
            setPayments(data);
        } catch (error) {
            console.error("Error fetching payment history:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch payment history." });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [user, hasFetched, toast]);

    return (
        <Card>
            <CardHeader>
                 <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="flex items-center gap-2"><CreditCard /> Your Payments</CardTitle>
                        <CardDescription>A record of all your token purchases and donations.</CardDescription>
                    </div>
                     <Button onClick={fetchPaymentHistory} variant="outline" size="sm" disabled={isLoading}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {hasFetched ? 'Refresh' : 'Load History'}
                    </Button>
                 </div>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <div className="flex justify-center items-center py-8">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                
                {hasFetched && (
                    payments.length > 0 ? (
                        <div className="border rounded-md min-h-[200px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Order ID</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payments.map(p => (
                                        <TableRow key={p.orderId}>
                                            <TableCell>{p.createdAt ? format((p.createdAt as Timestamp).toDate(), 'd MMM yyyy, HH:mm') : 'N/A'}</TableCell>
                                            <TableCell>
                                                <div className="font-medium flex items-center gap-2">
                                                    {p.tokensPurchased > 0 ? (
                                                        `Purchased ${p.tokensPurchased} Tokens`
                                                    ) : (
                                                        <>
                                                        <Heart className="h-4 w-4 text-red-500"/>
                                                        Donation
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">${p.amount.toFixed(2)} {p.currency}</TableCell>
                                            <TableCell className="text-muted-foreground">{p.orderId}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : <p className="text-center text-muted-foreground py-8">No payment history found.</p>
                )}
                 {!hasFetched && (
                     <p className="text-center text-muted-foreground py-8">Click the button to load your payment history.</p>
                 )}
            </CardContent>
        </Card>
    )
}
