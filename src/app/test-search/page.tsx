
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, Wand2 } from 'lucide-react';
import { testAdvancedSearch } from '@/ai/flows/test-advanced-search-flow';

export default function TestSearchPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [summary, setSummary] = useState('');
    const [error, setError] = useState('');

    const handleRunTest = async () => {
        setIsLoading(true);
        setSummary('');
        setError('');

        try {
            const result = await testAdvancedSearch();
            if (result.summary) {
                setSummary(result.summary);
            } else if (result.error) {
                setError(result.error);
            } else {
                 setError("The flow completed but returned neither a summary nor an error.");
            }

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected client-side error occurred.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="AI Agent Test" description="A test page to verify the AI's ability to generate a summary based on its internal knowledge." />
            <Card>
                <CardHeader>
                    <CardTitle>Test Scenario</CardTitle>
                    <CardDescription>
                        This test will instruct the AI agent to provide a summary of the UK travel advisory for Ukraine based on its existing knowledge.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-4">
                    <Button onClick={handleRunTest} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                        Run AI Summary Test
                    </Button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <LoaderCircle className="animate-spin" />
                            <p>AI agent is generating the summary...</p>
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
                </CardContent>
            </Card>
        </div>
    );
}
