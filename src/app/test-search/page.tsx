
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, Wand2 } from 'lucide-react';
import { scrapeUrlAction } from '@/actions/scraper';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TestSearchPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ content?: string; error?: string; } | null>(null);
    const [error, setError] = useState('');

    const handleRunTest = async () => {
        setIsLoading(true);
        setResult(null);
        setError('');

        try {
            const urlToScrape = 'https://www.gov.uk/foreign-travel-advice/ukraine';
            const response = await scrapeUrlAction(urlToScrape);
            
            if (response.success) {
                setResult({ content: response.content });
            } else {
                setError(response.error || 'Scraping failed with no specific error message.');
                setResult({ error: response.error || 'Scraping failed with no specific error message.' });
            }

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected client-side error occurred.';
            setError(errorMessage);
            setResult({ error: errorMessage });
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
                        This test will directly attempt to scrape the content from the UK government's travel advisory page for Ukraine.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-4">
                    <Button onClick={handleRunTest} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                        Run Scraper Test
                    </Button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <LoaderCircle className="animate-spin" />
                            Scraping URL...
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
                    
                    {result?.content && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Raw Scraped Content:</h3>
                            <ScrollArea className="h-72 p-4 border rounded-md bg-muted font-mono text-xs">
                                <pre className="whitespace-pre-wrap">
                                    {result.content}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
