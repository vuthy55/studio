

"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, Hand, Coins, Syringe, Building2, CheckCircle2, Info, UserCheck, UserX, FileText, Link as LinkIcon, Phone } from 'lucide-react';
import { lightweightCountries } from '@/lib/location-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { getCountryIntelData } from '@/actions/intel-admin';
import type { CountryIntelData } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


function LatestIntelDisplay({ intel, searchDate, debugLog }: { intel: Partial<CountryIntel> | null, searchDate: Date | null, debugLog: string[] }) {
    if (!intel || intel.finalScore === undefined) {
        return <p className="text-sm text-center text-muted-foreground py-8">Use "Get Latest Intel" to search for real-time information.</p>;
    }

    const { finalScore, summary, categoryAssessments, allReviewedSources } = intel;

    const getScoreAppearance = (score?: number) => {
        if (typeof score !== 'number') return { color: 'text-muted-foreground' };
        if (score <= 3) return { color: 'text-destructive' };
        if (score <= 7) return { color: 'text-amber-600' };
        return { color: 'text-green-600' };
    };
    
    const getSeverityAppearance = (score?: number) => {
        if (typeof score !== 'number') return { color: 'text-muted-foreground' };
        if (score >= 8) return { color: 'text-destructive' };
        if (score >= 4) return { color: 'text-amber-600' };
        return { color: 'text-green-600' };
    };

    const mainScoreAppearance = getScoreAppearance(finalScore);
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 border rounded-lg bg-muted/40">
                <div className="flex-1">
                    <h3 className="text-2xl font-bold">Overall Travel Safety Score</h3>
                    {searchDate && (
                        <div className="text-sm text-muted-foreground mt-1">
                            <span>As of {format(searchDate, 'PPp')}</span>
                        </div>
                    )}
                </div>
                 <div className="text-center">
                    <p className="text-sm font-bold text-muted-foreground">FINAL SCORE</p>
                    <p className={cn("text-6xl font-bold", mainScoreAppearance.color)}>{finalScore}/10</p>
                </div>
            </div>

            {/* {categoryAssessments && (
                 <Card>
                    <CardHeader><CardTitle className="text-lg">Risk Severity Levels</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                       {Object.entries(categoryAssessments).map(([category, catScore]) => (
                            <div key={category} className="text-center p-2 rounded-lg bg-background border">
                                <p className="text-sm font-semibold">{category}</p>
                                <p className={cn("text-3xl font-bold", getSeverityAppearance(catScore).color)}>{catScore}/10</p>
                            </div>
                        ))}
                    </CardContent>
                 </Card>
            )} */}

            <div className="space-y-4">
                 <h4 className="text-lg font-semibold">Analyst Briefing</h4>
                <div className="p-4 border rounded-md bg-background text-sm text-muted-foreground whitespace-pre-wrap">
                    {summary}
                </div>
                 <Card className="border-amber-500/50 bg-amber-500/10 mt-4">
                    <CardContent className="p-3 text-amber-800 text-xs font-semibold">
                        Reminder: AI intelligence can make mistakes. Always double-check critical information with other sources.
                    </CardContent>
                </Card>
            </div>
            
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="sources">
                    <AccordionTrigger>
                        <h4 className="text-lg font-semibold">Sources Reviewed by AI ({allReviewedSources?.length || 0})</h4>
                    </AccordionTrigger>
                    <AccordionContent>
                        {allReviewedSources && allReviewedSources.length > 0 ? (
                             <ScrollArea className="h-48 border rounded-md p-4">
                            <ul className="list-disc pl-5 space-y-1 text-sm">
                                {allReviewedSources.map((source, index) => (
                                    <li key={`reviewed-${index}`}>
                                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                                            {source.url}
                                        </a>
                                        <p className="text-xs text-muted-foreground italic pl-2 mt-1">"{source.snippet}"</p>
                                    </li>
                                ))}
                            </ul>
                            </ScrollArea>
                        ) : (
                            <p className="text-sm text-muted-foreground">No sources were reviewed for this analysis.</p>
                        )}
                    </AccordionContent>
                </AccordionItem>
                 {/* <AccordionItem value="debug">
                    <AccordionTrigger>
                        <h4 className="text-lg font-semibold">Debug Log</h4>
                    </AccordionTrigger>
                    <AccordionContent>
                        {debugLog.length > 0 ? (
                           <ScrollArea className="h-48 p-4 border rounded-md bg-muted font-mono text-xs">
                            {debugLog.map((log, index) => (
                                <p key={index} className={cn("whitespace-pre-wrap", log.includes('[FAIL]') || log.includes('[CRITICAL]') ? 'text-destructive' : '')}>
                                    {log}
                                </p>
                            ))}
                            </ScrollArea>
                        ) : (
                            <p className="text-sm text-muted-foreground">No debug information available.</p>
                        )}
                    </AccordionContent>
                </AccordionItem> */}
            </Accordion>
        </div>
    );
}

type InfoTab = 'latest' | 'holidays' | 'etiquette' | 'visa' | 'emergency';

function IntelContent() {
    const { userProfile, settings, spendTokensForTranslation } = useUserData();
    const { toast } = useToast();
    
    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [activeTab, setActiveTab] = useState<InfoTab>('latest');
    
    const [aiIntel, setAiIntel] = useState<Partial<CountryIntel> | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [lastSearchDate, setLastSearchDate] = useState<Date | null>(null);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    
    const [staticIntel, setStaticIntel] = useState<CountryIntelData | null>(null);

    const countryOptions = useMemo(() => lightweightCountries.map(c => ({ code: c.code, name: c.name })), []);

    const selectedCountryName = useMemo(() => {
        return staticIntel?.countryName || countryOptions.find(c => c.code === selectedCountryCode)?.name || '';
    }, [selectedCountryCode, countryOptions, staticIntel]);

    
    const handleCountrySelection = async (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        setAiIntel(null);
        setLastSearchDate(null);
        setActiveTab('latest');
        setDebugLog([]);
        setStaticIntel(null);
        
        const staticData = await getCountryIntelData(countryCode);
        if (staticData) {
            setStaticIntel(staticData);
        } else {
             toast({ variant: 'destructive', title: 'Data Missing', description: `Static intelligence data for this country has not been built in the admin panel.`});
        }
    };

    const handleGenerateIntel = async () => {
        if (!selectedCountryCode) return;
        
        if (!settings || !userProfile) {
            toast({ variant: 'destructive', title: 'Error', description: 'User data or settings are not available.' });
            return;
        }
        
        const cost = settings.infohubAiCost || 10;
        if ((userProfile.tokenBalance || 0) < cost) {
            toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens for this action.` });
            return;
        }

        setIsGeneratingIntel(true);
        setAiIntel(null);
        setLastSearchDate(new Date());
        setDebugLog([]);

        try {
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);
            if (!spendSuccess) {
                throw new Error("Token spending failed. Your balance may have changed.");
            }
            
            const { intel, debugLog: log } = await getCountryIntel({ countryCode: selectedCountryCode });
            setDebugLog(log);
            
            if (!intel || intel.finalScore === undefined) {
                 throw new Error("The AI returned an empty or invalid response. Please check the debug logs for more details.");
            }
            
            setAiIntel(intel);
            setActiveTab('latest');
            toast({ title: 'Intel Generated', description: `Successfully generated the latest information for ${selectedCountryName}.` });

        } catch (error: any) {
            console.error("Error generating country intel:", error);
            toast({ 
                variant: 'destructive', 
                title: 'AI Task Failed', 
                description: `${error.message}`,
                duration: 7000
            });
        } finally {
            setIsGeneratingIntel(false);
        }
    };

    const formatDateSafely = (dateString: string) => {
        if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
            try {
                return format(new Date(dateString), 'MMMM d');
            } catch (e) { return dateString; }
        }
        return dateString;
    };
    
    return (
        <div className="space-y-8">
            <MainHeader title="Intel" description="Your source for global travel intelligence." />
            
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle>Location Intel</CardTitle>
                            <CardDescription>
                                Select a country to view standard information. For the absolute latest on any country, use our AI service.
                            </CardDescription>
                        </div>
                         <Dialog>
                            <DialogTrigger asChild>
                                <Button>
                                    <Info className="h-4 w-4 mr-2"/>
                                    How "Latest Intel" Works
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>How "Latest Intel" Works</DialogTitle>
                                     <DialogDescription>
                                        Our AI analyst provides a real-time risk assessment for travelers. Here's our robust research process.
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh] pr-4">
                                <div className="space-y-4 text-sm py-4">
                                     <p className="text-destructive font-semibold">Disclaimer: While our AI does its best to provide accurate, up-to-date information, it can make mistakes. Always verify critical details with official government sources before making travel decisions.</p>
                                    <p><strong>1. Dual-Tiered Data Gathering:</strong> The agent first performs targeted Google searches against official government sites and reputable news outlets. If a critical web search (like for a travel advisory) fails to return recent, relevant results, the agent initiates a fallback: it directly scrapes the content from the primary government source. This ensures we always have the most critical data.</p>
                                    <p><strong>2. Source Verification:</strong> The system prioritizes the most current information. For breaking news, it discards articles older than 30 days. For official advisories, which can be long-standing, it focuses on the latest available data from government sources, regardless of its publication date.</p>
                                    <p><strong>3. Scoring and Analysis:</strong> The AI analyzes the verified content to assign a 0-10 severity score to each category (e.g., Political Stability, Health). "Red flag" terms like 'war' or 'do not travel' automatically trigger a high severity score for maximum caution.</p>
                                    <p><strong>4. Summarization:</strong> The AI writes a three-paragraph briefing: an overall summary, a breakdown of key issues, and a final recommendation, including a list of the key articles it used for its analysis.</p>
                                </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={handleCountrySelection} value={selectedCountryCode}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a country..." />
                        </SelectTrigger>
                        <SelectContent>
                            <ScrollArea className="h-72">
                                {countryOptions.map(c => (
                                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                ))}
                            </ScrollArea>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {selectedCountryCode && (
                <>
                <Card>
                    <CardHeader>
                        <CardTitle>AI-Powered Intel Search for {selectedCountryName}</CardTitle>
                        <CardDescription>Click to get the latest travel advisories, scams, and more, generated by AI.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel || (userProfile?.tokenBalance ?? 0) < (settings?.infohubAiCost ?? 10)}>
                                {isGeneratingIntel ? <LoaderCircle className="animate-spin mr-2"/> : <Wand2 className="mr-2"/>}
                                Get Latest Intel
                            </Button>
                            <Badge variant="secondary" className="flex items-center gap-1.5 text-base">
                                <Coins className="h-4 w-4 text-amber-500" /> {settings?.infohubAiCost || 10} Tokens
                            </Badge>
                        </div>
                        {(userProfile?.tokenBalance ?? 0) < (settings?.infohubAiCost ?? 10) && <p className="text-destructive text-sm mt-2">Insufficient tokens.</p>}
                    </CardContent>
                </Card>

                 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InfoTab)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="latest"><AlertTriangle className="mr-2"/> Latest</TabsTrigger>
                        <TabsTrigger value="holidays"><Calendar className="mr-2"/> Holidays</TabsTrigger>
                        <TabsTrigger value="etiquette"><Hand className="mr-2"/> Etiquette</TabsTrigger>
                        <TabsTrigger value="visa"><Building2 className="mr-2"/> Visa</TabsTrigger>
                        <TabsTrigger value="emergency"><Phone className="mr-2"/> Emergency</TabsTrigger>
                    </TabsList>

                    <TabsContent value="latest" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Latest Intelligence</CardTitle>
                                <CardDescription>This information is summarized by AI based on verified, recent web sources.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                               {isGeneratingIntel ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                        <p className="ml-2 text-muted-foreground">Generating AI briefing...</p>
                                    </div>
                                ) : (
                                    <LatestIntelDisplay intel={aiIntel} searchDate={lastSearchDate} debugLog={debugLog} />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="holidays" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Major Festivals & Holidays</CardTitle>
                                <CardDescription>
                                    Standard information for {selectedCountryName}.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                               {(staticIntel && staticIntel.publicHolidays && staticIntel.publicHolidays.length > 0) ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[200px]">Date</TableHead>
                                                <TableHead>Holiday</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {staticIntel.publicHolidays.map((event, index) => (
                                                <TableRow key={`holiday-${index}`}>
                                                    <TableCell className="font-medium">{event.date}</TableCell>
                                                    <TableCell>{event.name}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                               ) : (
                                   <p className="text-sm text-muted-foreground">No standard data available for this country.</p>
                               )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="etiquette" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cultural Etiquette</CardTitle>
                                <CardDescription>
                                     Standard information for {selectedCountryName}.
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                {(staticIntel && staticIntel.etiquette) ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {staticIntel.etiquette.map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No standard data available for this country.</p>
                                )}
                             </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="visa" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Visa Information</CardTitle>
                                <CardDescription>
                                     Standard information for {selectedCountryName} - Always verify with an official embassy.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <p className="text-sm">{staticIntel?.visaInformation || 'No standard data available for this country.'}</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="emergency" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Emergency Numbers</CardTitle>
                                 <CardDescription>
                                    Standard information for {selectedCountryName}.
                                </CardDescription>
                            </Header>
                             <CardContent>
                                {(staticIntel && staticIntel.emergencyNumbers && staticIntel.emergencyNumbers.length > 0) ? (
                                    <Table>
                                        <TableBody>
                                            {staticIntel.emergencyNumbers.map((item, index) => {
                                                const parts = item.split(':');
                                                const service = parts.length > 1 ? parts[0] : 'Number';
                                                const number = parts.length > 1 ? parts.slice(1).join(':').trim() : item;
                                                return (
                                                    <TableRow key={index}>
                                                        <TableCell className="font-medium">{service}</TableCell>
                                                        <TableCell className="font-mono text-right">{number}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                 ) : (
                                     <p className="text-sm text-muted-foreground">No standard data available for this country.</p>
                                 )}
                             </CardContent>
                        </Card>
                    </TabsContent>

                 </Tabs>
                </>
            )}
        </div>
    );
}

export default function IntelPage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <IntelContent />
        </Suspense>
    );
}
