
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { offlineAudioPackLanguages, type LanguageCode } from '@/lib/data';
import { downloadLanguagePack } from '@/actions/audio';
import { useToast } from '@/hooks/use-toast';

export default function TestDownloadPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode | ''>('');
    const [resultData, setResultData] = useState<any>(null);
    const { toast } = useToast();

    const handleDownloadTest = async () => {
        if (!selectedLanguage) {
            toast({
                variant: 'destructive',
                title: 'No Language Selected',
                description: 'Please select a language to test.',
            });
            return;
        }
        setIsLoading(true);
        setResultData(null);
        try {
            const result = await downloadLanguagePack(selectedLanguage);
            setResultData(result);
            toast({
                title: 'Test Complete',
                description: `Download attempt for "${selectedLanguage}" finished. Check results below.`,
            });
        } catch (e: any) {
            setResultData({ error: e.message, stack: e.stack });
            toast({
                variant: 'destructive',
                title: 'Client-Side Error',
                description: 'The server action call failed on the client.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <MainHeader title="Download Test Page" description="A diagnostic tool to test downloading audio packs from Firebase Storage." />
            <Card>
                <CardHeader>
                    <CardTitle>Manual Download Test</CardTitle>
                    <CardDescription>
                        This page directly calls the `downloadLanguagePack` server action. Use it to verify if the pack files exist in storage and can be fetched.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Select onValueChange={(value) => setSelectedLanguage(value as LanguageCode)} value={selectedLanguage}>
                            <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Select a language pack..." />
                            </SelectTrigger>
                            <SelectContent>
                                {offlineAudioPackLanguages.map((lang) => (
                                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleDownloadTest} disabled={isLoading || !selectedLanguage}>
                            {isLoading ? <LoaderCircle className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            Run Download Test
                        </Button>
                    </div>

                    {resultData && (
                        <div className="w-full space-y-2 pt-4">
                            <h3 className="font-semibold text-lg">Test Result:</h3>
                            <pre className="p-4 border rounded-md bg-muted font-mono text-xs overflow-auto">
                                {JSON.stringify(resultData, null, 2)}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
