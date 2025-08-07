
"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { getFeedbackSubmissions, type FeedbackSubmission } from '@/actions/feedback';

export default function FeedbackTab() {
    const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchFeedback = useCallback(async () => {
        setIsLoading(true);
        try {
            const submissions = await getFeedbackSubmissions();
            setFeedback(submissions);
        } catch (error) {
            
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load feedback submissions.' });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Feedback</CardTitle>
                <CardDescription>Review feedback, feature requests, and bug reports from users.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={fetchFeedback} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {hasFetched ? "Refresh" : "Load Feedback"}
                </Button>
                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : hasFetched ? (
                    feedback.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No feedback submissions yet.</p>
                    ) : (
                        <div className="mt-4 space-y-4">
                            {feedback.map(item => (
                                <Card key={item.id}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg">{item.category}</CardTitle>
                                                <CardDescription>
                                                    Submitted by <a href={`mailto:${item.userEmail}`} className="text-primary hover:underline">{item.userEmail}</a> on {format(new Date(item.createdAt), 'PPpp')}
                                                </CardDescription>
                                            </div>
                                            {item.screenshotUrl && (
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline">View Screenshot</Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-4xl">
                                                        <Image src={item.screenshotUrl} alt="User screenshot" width={1200} height={800} className="w-full h-auto rounded-md" />
                                                    </DialogContent>
                                                </Dialog>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="whitespace-pre-wrap">{item.comment}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )
                ) : (
                     <p className="text-center text-muted-foreground py-10">Click the button to load user feedback.</p>
                )}
            </CardContent>
        </Card>
    );
}
