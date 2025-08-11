
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportsAdmin } from '@/actions/reports-admin';
import type { Report } from '@/lib/types';

export default function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedReports = await getReportsAdmin();
      setReports(fetchedReports);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch reports.' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleViewVibe = (report: Report) => {
    router.push(`/common-room/${report.vibeId}?from=reports&reportId=${report.id}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><AlertTriangle /> User Reports</CardTitle>
        <CardDescription>
          Review and take action on Vibes that have been reported by the community.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetchReports} disabled={isLoading}>
            {isLoading ? <LoaderCircle className="animate-spin mr-2"/> : <RefreshCw className="mr-2"/>}
            Refresh List
        </Button>

        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Vibe Topic</TableHead>
                        <TableHead>Reported By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                     {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : reports.length > 0 ? (
                        reports.map((report) => (
                            <TableRow key={report.id} data-state={report.status === 'pending' ? 'selected' : ''}>
                                <TableCell className="font-medium">{report.vibeTopic}</TableCell>
                                <TableCell>{report.reporterName} ({report.reporterEmail})</TableCell>
                                <TableCell>{formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</TableCell>
                                <TableCell className="capitalize">{report.status}</TableCell>
                                <TableCell className="text-right">
                                     <Button variant="outline" size="sm" onClick={() => handleViewVibe(report)}>
                                        View & Moderate
                                        <ArrowRight className="ml-2 h-4 w-4"/>
                                     </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                No reports found.
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
