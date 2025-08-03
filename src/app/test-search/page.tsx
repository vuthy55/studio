
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, Wand2 } from 'lucide-react';
import { testAdvancedSearch } from '@/ai/flows/test-advanced-search-flow';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TestSearchPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ summary?: string; debugLog?: string[]; } | null>(null);
    const [error, setError] = useState('');

    const handleRunTest = async () => {
        setIsLoading(true);
        setResult(null);
        setError('');

        try {
            const response = await testAdvancedSearch();
            setResult(response);
        } catch (e: any) {
            setError(e.message || 'An unexpected client-side error occurred.');
            if (e.debugLog) {
                setResult({ debugLog: e.debugLog });
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="Web Scraper Test" description="A test page to verify the app's ability to fetch and parse content from a specific URL." />
            <Card>
                <CardHeader>
                    <CardTitle>Test Scenario</CardTitle>
                    <CardDescription>
                        This test will run an AI agent instructed to find the UK travel advisory for Ukraine, scrape the page, and summarize it.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-4">
                    <Button onClick={handleRunTest} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                        Run AI Agent Test
                    </Button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <LoaderCircle className="animate-spin" />
                            Running AI agent...
                        </div>
                    )}
                    
                    {error && (
                         <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg text-destructive">An Error Occurred:</h3>
                            <div className="p-4 border rounded-md bg-destructive/10 text-destructive whitespace-pre-wrap font-mono text-sm">
                                {error}
                            </div>
                        </div>
                    )}
                    
                    {result?.summary && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">AI Summary Result:</h3>
                            <div className="p-4 border rounded-md bg-muted whitespace-pre-wrap">
                                {result.summary}
                            </div>
                        </div>
                    )}

                    {result?.debugLog && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Debug Log:</h3>
                            <ScrollArea className="h-48 p-4 border rounded-md bg-stone-900 text-stone-300 font-mono text-xs">
                                <pre className="whitespace-pre-wrap">
                                    {result.debugLog.join('\n')}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
