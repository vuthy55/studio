
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { LoaderCircle, RefreshCw, Flag, MessageSquare, Shield, Check, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getReports, dismissReport, resolveReportAndDeleteContent, type ClientReport } from '@/actions/common-room-admin';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ReportsTab() {
    const [reports, setReports] = useState<ClientReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

    const fetchReports = useCallback(async () => {
        setIsLoading(true);
        try {
            const reportData = await getReports();
            // Sort reports by date on the client side
            const sortedReports = reportData.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
            setReports(sortedReports);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load reports.' });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);
    
    // Auto-fetch on component mount
    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const handleDismissReport = async (reportId: string) => {
        setIsActionLoading(reportId);
        const result = await dismissReport(reportId);
        if (result.success) {
            toast({ title: "Report Dismissed" });
            setReports(prev => prev.filter(r => r.id !== reportId));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsActionLoading(null);
    };

    const handleDeleteContent = async (report: ClientReport) => {
        setIsActionLoading(report.id);
        const result = await resolveReportAndDeleteContent({
            reportId: report.id,
            contentType: report.type,
            contentId: report.contentId,
            vibeId: report.vibeId,
        });

        if (result.success) {
            toast({ title: 'Action Taken', description: `The reported ${report.type} has been deleted.` });
            setReports(prev => prev.filter(r => r.id !== report.id));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsActionLoading(null);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield /> Moderation Queue</CardTitle>
                <CardDescription>Review and take action on user-submitted reports.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={fetchReports} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    {hasFetched ? "Refresh" : "Load Reports"}
                </Button>
                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : hasFetched ? (
                    reports.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">The moderation queue is empty. Great job!</p>
                    ) : (
                        <div className="mt-4 space-y-4">
                            {reports.map(report => (
                                <Card key={report.id} className="border-l-4 border-destructive">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                     {report.type === 'vibe' ? <MessageSquare className="h-5 w-5"/> : <Flag className="h-5 w-5"/>}
                                                     Reported {report.type === 'vibe' ? 'Vibe' : 'Post'}: "{report.vibeTopic}"
                                                     <Badge variant="secondary" className="capitalize">{report.status}</Badge>
                                                </CardTitle>
                                                <CardDescription>
                                                    Reported by <Link href={`/admin/${report.reporter.uid}`} className="text-primary hover:underline">{report.reporter.email}</Link> {formatDistanceToNow(new Date(report.reportedAt), { addSuffix: true })}
                                                </CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button size="sm" variant="outline" onClick={() => handleDismissReport(report.id)} disabled={!!isActionLoading}>
                                                    {isActionLoading === report.id ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}
                                                    <span className="ml-2">Dismiss</span>
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                         <Button size="sm" variant="destructive" disabled={!!isActionLoading}>
                                                            <Trash2 className="h-4 w-4" /><span className="ml-2">Delete Content</span>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Reported Content?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently delete the {report.type} and resolve this report. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteContent(report)} disabled={!!isActionLoading} className="bg-destructive hover:bg-destructive/90">
                                                                {isActionLoading === report.id ? <LoaderCircle className="animate-spin" /> : 'Confirm & Delete'}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="font-semibold">Reason for Report:</h4>
                                                <p className="text-sm p-2 bg-muted rounded-md">{report.reason}</p>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold">Content Link:</h4>
                                                <p className="text-sm">
                                                    <Link href={`/common-room/${report.vibeId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                        Go to Vibe <ExternalLink className="h-3 w-3"/>
                                                    </Link>
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )
                ) : (
                     <p className="text-center text-muted-foreground py-10">Click the button to load the report queue.</p>
                )}
            </CardContent>
        </Card>
    );
}
