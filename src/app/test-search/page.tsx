
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
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const [debugLog, setDebugLog] = useState<string[]>([]);

    const handleRunTest = async () => {
        setIsLoading(true);
        setResult('');
        setError('');
        setDebugLog([]);

        try {
            const response = await testAdvancedSearch();
            setResult(response.summary);
            setDebugLog(response.debugLog);
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
            if (e.debugLog) {
                setDebugLog(e.debugLog);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="Advanced Web Search Test" description="A test page to verify the AI's ability to search and summarize a specific country's advisory." />
            <Card>
                <CardHeader>
                    <CardTitle>Test Scenario</CardTitle>
                    <CardDescription>
                        This test will instruct the AI to use its tools to find the UK government's travel advisory for "Ukraine" and then summarize the findings.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-4">
                    <Button onClick={handleRunTest} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                        Run Test
                    </Button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <LoaderCircle className="animate-spin" />
                            AI is working... This may take a moment.
                        </div>
                    )}
                    
                    {debugLog.length > 0 && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Debug Log:</h3>
                            <ScrollArea className="h-64 p-4 border rounded-md bg-muted font-mono text-xs">
                                {debugLog.map((log, index) => (
                                    <p key={index} className="whitespace-pre-wrap">{log}</p>
                                ))}
                            </ScrollArea>
                        </div>
                    )}

                    {result && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">AI Generated Summary:</h3>
                            <div className="p-4 border rounded-md bg-muted whitespace-pre-wrap font-mono text-sm">
                                {result}
                            </div>
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
                </CardContent>
            </Card>
        </div>
    );
}
