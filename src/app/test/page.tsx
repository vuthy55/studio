
'use client';

import { runTestFlow } from '@/ai/flows/test-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState, useMemo, useCallback } from 'react';
import { LoaderCircle, Banknote, PlusCircle, MinusCircle, DollarSign, ExternalLink } from 'lucide-react';
import BuyTokens from '@/components/BuyTokens';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { getTokenAnalytics, getTokenLedger, type TokenAnalytics, type TokenLedgerEntry, getFinancialLedger, getLedgerAnalytics, type FinancialLedgerEntry } from '@/services/ledger';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import Link from 'next/link';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';


function TokenAnalyticsTest() {
    const { toast } = useToast();
    const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
    const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const getReasonText = (log: TokenLedgerEntry) => {
        switch (log.actionType) {
            case 'purchase': return 'Token Purchase';
            case 'signup_bonus': return 'Signup Bonus';
            case 'referral_bonus': return 'Referral Bonus';
            case 'practice_earn': return 'Practice Reward';
            case 'translation_spend': return 'Live Translation';
            case 'live_sync_spend': return 'Live Sync Usage';
            case 'live_sync_online_spend': return 'Sync Online Usage';
            default: return 'Unknown Action';
        }
    };
    
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const handleFetchData = useCallback(async () => {
        setIsLoading(true);
        setAnalytics(null);
        setLedger([]);
        try {
            const [analyticsData, ledgerData] = await Promise.all([
                getTokenAnalytics(),
                getTokenLedger()
            ]);
            setAnalytics(analyticsData);
            setLedger(ledgerData);
        } catch (err: any) {
            console.error("Error fetching token data:", err);
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not fetch token data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Token Economy Test</CardTitle>
                <CardDescription>
                    Fetches and displays a full overview of the token economy, including analytics and a detailed transaction ledger. This mirrors the "Tokens" tab in the Admin Dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={handleFetchData} disabled={isLoading}>
                    {isLoading ? <LoaderCircle className="animate-spin" /> : 'Fetch Token Data'}
                </Button>

                {analytics && (
                    <div className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base"><Banknote/> Total Tokens</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl font-bold">{analytics.totalTokensInSystem.toLocaleString()}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base"><PlusCircle className="text-green-500" /> Tokens Acquired</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-sm">
                                    <div className="flex justify-between"><span>Purchased:</span> <span className="font-bold">{analytics.purchased.toLocaleString()}</span></div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base"><MinusCircle className="text-red-500" /> Tokens Distributed</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-sm">
                                    <div className="flex justify-between"><span>Signup:</span> <span className="font-bold">{analytics.signupBonus.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Referral:</span> <span className="font-bold">{analytics.referralBonus.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Practice:</span> <span className="font-bold">{analytics.practiceEarn.toLocaleString()}</span></div>
                                    <Separator className="my-1" />
                                    <div className="flex justify-between font-bold"><span>Total Free:</span> <span>{analytics.totalAwarded.toLocaleString()}</span></div>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="border rounded-md min-h-[200px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead className="text-right">QTY</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ledger.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs">{format(log.timestamp, 'd MMM, HH:mm')}</TableCell>
                                            <TableCell className="text-xs">{log.userEmail}</TableCell>
                                            <TableCell className={`text-right font-medium ${log.tokenChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {log.tokenChange >= 0 ? '+' : ''}{log.tokenChange.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-xs">{getReasonText(log)}</TableCell>
                                            <TableCell className="text-xs">
                                                {log.description}
                                                {log.duration && ` (${formatDuration(log.duration)})`}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function FinancialLedgerTest() {
    const { toast } = useToast();
    const [analytics, setAnalytics] = useState<{ revenue: number, expenses: number, net: number } | null>(null);
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [userMap, setUserMap] = useState<Record<string, string>>({});

    const handleFetchData = useCallback(async () => {
        setIsLoading(true);
        setAnalytics(null);
        setLedger([]);
        setUserMap({});
        try {
            const [analyticsData, ledgerData] = await Promise.all([
                getLedgerAnalytics(),
                getFinancialLedger(),
            ]);
            setAnalytics(analyticsData);
            setLedger(ledgerData);

            const userIds = [...new Set(ledgerData.map(item => item.userId).filter(Boolean))] as string[];
            if (userIds.length > 0) {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where(documentId(), 'in', userIds));
                const userSnapshot = await getDocs(q);
                const fetchedUserMap: Record<string, string> = {};
                userSnapshot.forEach(doc => {
                    fetchedUserMap[doc.id] = doc.data().email || 'Unknown User';
                });
                setUserMap(fetchedUserMap);
            }

        } catch (err: any) {
            console.error("Error fetching financial data:", err);
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not fetch financial data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
     return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Financial Ledger Test</CardTitle>
                <CardDescription>
                    Fetches and displays a full overview of the financial ledger. This mirrors the "Financial" tab in the Admin Dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Button onClick={handleFetchData} disabled={isLoading}>
                    {isLoading ? <LoaderCircle className="animate-spin" /> : 'Fetch Financial Data'}
                </Button>

                {analytics && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                                <PlusCircle className="h-4 w-4 text-green-500" />
                                </CardHeader>
                                <CardContent>
                                <div className="text-2xl font-bold text-green-600">${analytics.revenue.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                                <MinusCircle className="h-4 w-4 text-red-500" />
                                </CardHeader>
                                <CardContent>
                                <div className="text-2xl font-bold text-red-600">${analytics.expenses.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                <div className={`text-2xl font-bold ${analytics.net >= 0 ? 'text-foreground' : 'text-red-600'}`}>${analytics.net.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="border rounded-md min-h-[200px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Type/Method</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ledger.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-xs">{format(item.timestamp as Date, 'd MMM, HH:mm')}</TableCell>
                                            <TableCell className={`text-right font-medium text-xs ${item.type === 'revenue' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.type === 'revenue' ? '+' : '-'}${item.amount.toFixed(2)}
                                            </TableCell>
                                             <TableCell className="text-xs capitalize">
                                                {item.source === 'manual' && item.link ? (
                                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 flex items-center gap-1">
                                                        {item.source} <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                ) : (
                                                    item.source
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs">{item.description}</TableCell>
                                            <TableCell className="text-xs">{item.userId ? (userMap[item.userId] || 'User') : 'System'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
     )
}

const TestPage = () => {
  const [user] = useAuthState(auth);
  const [name, setName] = useState('programmers');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const models = [
    'googleai/gemini-2.0-flash',
    'googleai/gemini-pro',
    'googleai/gemini-2.0-flash-preview-image-generation',
    'googleai/gemini-2.5-flash-preview-tts',
  ];

  const handleRunTest = async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const response = await runTestFlow(name);
      setResult(response);
    } catch (e: any) {
      console.error('Error running test flow:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <FinancialLedgerTest />
      <TokenAnalyticsTest />

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Genkit AI Test Page</CardTitle>
          <CardDescription>This page tests the AI functionality and lists available models.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Enter a topic and click the button to get a joke. This uses the `googleai/gemini-2.0-flash` model.
          </p>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a topic for a joke"
            />
            <Button onClick={handleRunTest} disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : 'Run Test Flow'}
            </Button>
          </div>
          {result && (
            <div className="p-4 bg-secondary rounded-md">
              <p className="font-semibold">AI Response:</p>
              <p>{result}</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-destructive/20 text-destructive rounded-md">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle>PayPal Sandbox Test</CardTitle>
            <CardDescription>
                Click the button below to test the PayPal checkout flow. Ensure you have set your sandbox credentials in the <code>.env.local</code> file.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {user ? (
                <BuyTokens />
            ) : (
                <p className="text-muted-foreground">Please log in to test token purchases.</p>
            )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Available AI Models</CardTitle>
          <CardDescription>This is a list of known compatible models for this app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1 bg-secondary p-4 rounded-md">
            {models.map((model) => (
              <li key={model} className="font-mono text-sm">{model}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestPage;
