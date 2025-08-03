
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, Wand2 } from 'lucide-react';
import { scrapeUrlAction } from '@/actions/scraper';
import { summarizeContent } from '@/ai/flows/test-summarize-flow';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TestSearchPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [rawContent, setRawContent] = useState('');
    const [summary, setSummary] = useState('');
    const [error, setError] = useState('');

    const handleRunTest = async () => {
        setIsLoading(true);
        setRawContent('');
        setSummary('');
        setError('');

        try {
            // Step 1: Scrape the URL
            const urlToScrape = 'https://www.gov.uk/foreign-travel-advice/ukraine';
            const scrapeResponse = await scrapeUrlAction(urlToScrape);
            
            if (!scrapeResponse.success || !scrapeResponse.content) {
                throw new Error(scrapeResponse.error || 'Scraping failed with no specific error message.');
            }
            setRawContent(scrapeResponse.content);

            // Step 2: Summarize the content with AI
            const summaryResponse = await summarizeContent(scrapeResponse.content);
            if (!summaryResponse) {
                 throw new Error("AI failed to generate a summary. The model returned a null or empty response.");
            }
            setSummary(summaryResponse);

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected client-side error occurred.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="Web Scraper & AI Summary Test" description="A test page to verify scraping a URL and summarizing its content." />
            <Card>
                <CardHeader>
                    <CardTitle>Test Scenario</CardTitle>
                    <CardDescription>
                        This test will scrape the UK travel advisory for Ukraine, then use an AI to summarize the result.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-4">
                    <Button onClick={handleRunTest} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                        Run Scraper & Summary Test
                    </Button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <LoaderCircle className="animate-spin" />
                            {rawContent ? 'Summarizing content...' : 'Scraping URL...'}
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

                    {rawContent && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Raw Scraped Content:</h3>
                            <ScrollArea className="h-72 p-4 border rounded-md bg-muted font-mono text-xs">
                                <pre className="whitespace-pre-wrap">
                                    {rawContent}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
