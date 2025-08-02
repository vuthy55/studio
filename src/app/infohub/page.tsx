
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, BookUser, ShieldAlert, Phone, Link as LinkIcon, Hand, Coins, Briefcase, Syringe, Building2, CheckCircle2, Info, UserCheck, UserX, FileText } from 'lucide-react';
import { lightweightCountries } from '@/lib/location-data';
import { staticEvents } from '@/lib/events-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { etiquetteData } from '@/lib/etiquette-data';
import { visaData } from '@/lib/visa-data';
import { emergencyData } from '@/lib/emergency-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


function LatestIntelDisplay({ intel, searchDate }: { intel: Partial<CountryIntel> | null, searchDate: Date | null }) {
    if (!intel?.overallAssessment) {
        return <p className="text-sm text-center text-muted-foreground py-8">Use "Get Latest Intel" to search for real-time information.</p>;
    }

    const { finalScore, summary, sourcesUsed, categoryAssessments, analystScore, quantitativeScore } = intel.overallAssessment;
    const allReviewedSources = intel.allReviewedSources || [];

    const getScoreAppearance = (currentScore: number) => {
        if (currentScore <= 3) return { color: 'text-destructive', icon: <AlertTriangle className="h-full w-full" /> };
        if (currentScore <= 7) return { color: 'text-amber-600', icon: <Info className="h-full w-full" /> };
        return { color: 'text-green-600', icon: <CheckCircle2 className="h-full w-full" /> };
    };

    const mainScoreAppearance = getScoreAppearance(finalScore);

    const summaryWithClickableLink = () => {
        if (!summary) return null;
        
        const match = summary.match(/This assessment is based on (\d+) unique articles/);
        
        if (match && sourcesUsed && sourcesUsed.length > 0) {
            const count = match[1];
            const parts = summary.split(match[0]);
            return (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    <p>{parts[0]}</p>
                    <Popover>
                        <PopoverTrigger asChild>
                            <span className="text-primary font-bold cursor-pointer hover:underline">This assessment is based on {count} unique articles</span>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="grid gap-4">
                                <div className="space-y-1">
                                    <h4 className="font-medium leading-none">Key Sources Used in Summary</h4>
                                    <p className="text-sm text-muted-foreground">
                                        These articles were most influential.
                                    </p>
                                </div>
                                <ScrollArea className="h-48">
                                     <ul className="list-disc pl-5 text-sm space-y-1">
                                        {sourcesUsed?.map((source, index) => (
                                            <li key={`used-${index}`}>
                                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                                                    {source.url}
                                                </a>
                                                {source.publishedDate && (
                                                    <span className="text-muted-foreground text-xs ml-2">({format(new Date(source.publishedDate), 'MMM d, yyyy')})</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                 </ScrollArea>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <p>{parts[1]}</p>
                </div>
            );
        }
        return <div className="text-sm text-muted-foreground whitespace-pre-wrap">{summary}</div>
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 border rounded-lg bg-muted/40">
                <div className={cn("flex-shrink-0 w-20 h-20", mainScoreAppearance.color)}>
                    {mainScoreAppearance.icon}
                </div>
                <div className="flex-1">
                    <h3 className="text-2xl font-bold">Overall Assessment</h3>
                    {searchDate && (
                        <div className="text-sm text-muted-foreground mt-1">
                            <span>As of {format(searchDate, 'PPp')}</span>
                        </div>
                    )}
                </div>
                 <div className="text-center">
                    <p className="text-sm font-bold text-muted-foreground">FINAL RISK SCORE</p>
                    <p className={cn("text-6xl font-bold", mainScoreAppearance.color)}>{finalScore}</p>
                </div>
            </div>

            {categoryAssessments && (
                 <Card>
                    <CardHeader><CardTitle className="text-lg">Risk Breakdown</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                       {Object.entries(categoryAssessments).map(([category, catScore]) => (
                            <div key={category} className="text-left p-2 rounded-lg bg-background">
                                <p className="text-sm font-semibold">{category}</p>
                                <p className="text-2xl font-bold">{catScore}/2</p>
                            </div>
                        ))}
                         <div className="text-left p-2 rounded-lg bg-background font-semibold">
                            <p className="text-sm">Quantitative Score</p>
                            <p className="text-2xl font-bold">{quantitativeScore}/10</p>
                         </div>
                          <div className="text-left p-2 rounded-lg bg-background font-semibold">
                            <p className="text-sm">AI Analyst Score</p>
                            <p className="text-2xl font-bold">{analystScore}/10</p>
                         </div>
                    </CardContent>
                 </Card>
            )}
            
            <div className="space-y-4">
                 <h4 className="text-lg font-semibold">Analyst Briefing</h4>
                <div className="p-4 border rounded-md bg-background">
                    {summaryWithClickableLink()}
                </div>
            </div>

            {allReviewedSources && allReviewedSources.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-lg font-semibold">Sources Reviewed ({allReviewedSources.length})</h4>
                    <ScrollArea className="h-48 border rounded-md p-4">
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        {allReviewedSources.map((source, index) => (
                            <li key={`reviewed-${index}`}>
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                                    {source.url}
                                </a>
                                {source.publishedDate && (
                                    <span className="text-muted-foreground text-xs ml-2">({format(parseISO(source.publishedDate), 'MMM d, yyyy')})</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}

type InfoTab = 'latest' | 'holidays' | 'etiquette' | 'visa' | 'emergency';

function InfoHubContent() {
    const { user, loading: authLoading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();
    
    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [activeTab, setActiveTab] = useState<InfoTab>('latest');
    
    const [aiIntel, setAiIntel] = useState<Partial<CountryIntel> | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [lastSearchDate, setLastSearchDate] = useState<Date | null>(null);
    
    const countryOptions = useMemo(() => lightweightCountries, []);

    const selectedCountryName = useMemo(() => {
        return countryOptions.find(c => c.code === selectedCountryCode)?.name || '';
    }, [selectedCountryCode, countryOptions]);

    const staticHolidays = useMemo(() => staticEvents.filter(e => e.countryCode === selectedCountryCode), [selectedCountryCode]);
    const staticEtiquette = useMemo(() => etiquetteData[selectedCountryCode] || [], [selectedCountryCode]);
    const staticVisa = useMemo(() => visaData[selectedCountryCode] || '', [selectedCountryCode]);
    const staticEmergency = useMemo(() => {
        const emergency = emergencyData[selectedCountryCode];
        if (!emergency) return [];
        return [
            { label: 'Police', number: emergency.police },
            { label: 'Ambulance', number: emergency.ambulance },
            { label: 'Fire', number: emergency.fire },
            ...(emergency.touristPolice ? [{ label: 'Tourist Police', number: emergency.touristPolice }] : [])
        ];
    }, [selectedCountryCode]);
    
    const handleCountrySelection = (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        setAiIntel(null);
        setLastSearchDate(null);
        setActiveTab('latest');
    };

    const handleGenerateIntel = async () => {
        if (!selectedCountryName) return;
        
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

        try {
            const { intel, debugLog } = await getCountryIntel({ countryName: selectedCountryName });
            console.log("--- InfoHub Debug Log ---");
            debugLog.forEach(log => console.log(log));
            console.log("--- End Debug Log ---");
            
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);
            if (!spendSuccess) {
                throw new Error("Token spending failed. Your balance may have changed.");
            }
            
            if (!intel || !intel.overallAssessment) {
                 throw new Error("The AI returned an empty response. Please check the debug logs in the console.");
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
    
    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <MainHeader title="InfoHub" description="Your source for global travel intelligence." />
            
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <CardTitle>Location Intel</CardTitle>
                         <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                                    <Info className="h-4 w-4"/>
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>How "Latest Intel" Works</DialogTitle>
                                     <DialogDescription>
                                        Our AI analyst provides a real-time risk assessment for travelers. Here's the process.
                                        <br/><br/>
                                        <strong className="text-destructive">Disclaimer:</strong> While our AI does its best to provide accurate, up-to-date information, it can make mistakes. Always verify critical details with official government sources before making travel decisions. We are not responsible for any unintentional errors.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 text-sm py-4">
                                    <p><strong>1. Targeted Search:</strong> The system performs targeted Google searches across five key categories: official advisories, scams, theft, health, and political stability.</p>
                                    <p><strong>2. Source Verification:</strong> It only uses verifiable sources, focusing on government travel sites and reputable regional news outlets. Any source article older than 30 days is discarded.</p>
                                    <p><strong>3. AI Analysis & Scoring:</strong> The content from these sources is fed to an AI which is instructed to act as a travel analyst. It generates a single risk score from 0 (High Risk) to 10 (Very Safe) based on all factors.</p>
                                    <p><strong>4. Summarization:</strong> The AI writes a three-paragraph briefing: an overall summary, a breakdown of key issues (including specific locations if mentioned), and a final recommendation for backpackers.</p>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <CardDescription>
                        Select a country to view standard information. For the absolute latest on any country, use our AI service.
                    </CardDescription>
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
                        <TabsTrigger value="visa"><ShieldAlert className="mr-2"/> Visa</TabsTrigger>
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
                                    <LatestIntelDisplay intel={aiIntel} searchDate={lastSearchDate} />
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
                               {staticHolidays.length > 0 ? (
                                   <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Event</TableHead>
                                                <TableHead>Description</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {staticHolidays.map((event: any, index: number) => (
                                                <TableRow key={index}>
                                                    <TableCell className="whitespace-nowrap">{formatDateSafely(event.date)}</TableCell>
                                                    <TableCell className="font-medium">
                                                        {event.link ? (
                                                            <a href={event.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                                                                {event.name}
                                                                <LinkIcon className="h-3 w-3"/>
                                                            </a>
                                                        ) : (
                                                            event.name
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{event.description}</TableCell>
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
                                {staticEtiquette.length > 0 ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {staticEtiquette.map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
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
                                 <p className="text-sm">{staticVisa || 'No standard data available for this country.'}</p>
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
                            </CardHeader>
                             <CardContent>
                                {staticEmergency.length > 0 ? (
                                 <Table>
                                    <TableBody>
                                        {staticEmergency.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium capitalize">{item.label}</TableCell>
                                                <TableCell className="font-mono">{item.number}</TableCell>
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

                 </Tabs>
                </>
            )}
        </div>
    );
}

export default function InfoHubPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <InfoHubContent />
        </Suspense>
    );
}
