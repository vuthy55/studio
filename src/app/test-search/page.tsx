
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
    const [summary, setSummary] = useState('');
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [error, setError] = useState('');

    const handleRunTest = async () => {
        setIsLoading(true);
        setSummary('');
        setDebugLog([]);
        setError('');

        try {
            const result = await testAdvancedSearch();
            setSummary(result.summary);
            setDebugLog(result.debugLog);

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected client-side error occurred.';
            setError(errorMessage);
            if (e.debugLog) {
                setDebugLog(e.debugLog);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="AI Agent Tool Use Test" description="A test page to verify the AI can use tools to research and summarize information." />
            <Card>
                <CardHeader>
                    <CardTitle>Test Scenario</CardTitle>
                    <CardDescription>
                        This test will instruct the AI agent to use its tools to find the UK travel advisory for Ukraine, scrape the content, and then summarize the result.
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
                            <p>AI agent is performing its research...</p>
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
                    
                    {summary && (
                         <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg text-primary">AI Generated Summary:</h3>
                            <div className="p-4 border rounded-md bg-primary/10 whitespace-pre-wrap">
                                {summary}
                            </div>
                        </div>
                    )}

                    {debugLog.length > 0 && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Agent Debug Log:</h3>
                            <ScrollArea className="h-72 p-4 border rounded-md bg-muted font-mono text-xs">
                                {debugLog.map((log, index) => (
                                    <p key={index} className="whitespace-pre-wrap">{log}</p>
                                ))}
                            </ScrollArea>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
