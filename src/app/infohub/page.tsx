

"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, Hand, Coins, Syringe, Building2, CheckCircle2, Info, UserCheck, UserX, FileText, Link as LinkIcon, Phone, Train, Search, Plane, Bus, Car, Ship, Compass } from 'lucide-react';
import { lightweightCountries } from '@/lib/location-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { getCountryIntelData } from '@/actions/intel';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getTransportOptionsAction } from '@/actions/transport';
import type { TransportOption } from '@/ai/flows/types';
import { Input } from '@/components/ui/input';

const transportTypeIcons: Record<string, React.ReactNode> = {
    flight: <Plane className="h-6 w-6 text-blue-500" />,
    bus: <Bus className="h-6 w-6 text-green-500" />,
    train: <Train className="h-6 w-6 text-red-500" />,
    'ride-sharing': <Car className="h-6 w-6 text-purple-500" />,
    ferry: <Ship className="h-6 w-6 text-cyan-500" />,
    unknown: <Car className="h-6 w-6 text-gray-400" />
};

function LatestIntelDisplay({ intel, searchDate }: { intel: Partial<CountryIntel> | null, searchDate: Date | null }) {
    if (!intel || intel.finalScore === undefined) {
        return <p className="text-sm text-center text-muted-foreground py-8">Use "Get Latest Intel" to search for real-time information.</p>;
    }

    const { finalScore, summary, allReviewedSources } = intel;

    const getScoreAppearance = (score?: number) => {
        if (typeof score !== 'number') return { color: 'text-muted-foreground' };
        if (score <= 3) return { color: 'text-destructive' };
        if (score <= 7) return { color: 'text-amber-600' };
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
            </Accordion>
        </div>
    );
}

function LocationIntelTab() {
    const { userProfile, settings, spendTokensForTranslation } = useUserData();
    const { toast } = useToast();
    
    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [activeInfoTab, setActiveInfoTab] = useState('latest');
    
    const [aiIntel, setAiIntel] = useState<Partial<CountryIntel> | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [lastSearchDate, setLastSearchDate] = useState<Date | null>(null);
    
    const [staticIntel, setStaticIntel] = useState<CountryIntelData | null>(null);

    const countryOptions = useMemo(() => lightweightCountries.map(c => ({ code: c.code, name: c.name })), []);

    const selectedCountryName = useMemo(() => {
        return staticIntel?.countryName || countryOptions.find(c => c.code === selectedCountryCode)?.name || '';
    }, [selectedCountryCode, countryOptions, staticIntel]);
    
    const handleCountrySelection = async (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        setAiIntel(null);
        setLastSearchDate(null);
        setActiveInfoTab('latest');
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

        try {
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);
            if (!spendSuccess) throw new Error("Token spending failed.");
            
            const { intel } = await getCountryIntel({ countryCode: selectedCountryCode });
            
            if (!intel || intel.finalScore === undefined) throw new Error("The AI returned an empty or invalid response.");
            
            setAiIntel(intel);
            setActiveInfoTab('latest');
            toast({ title: 'Intel Generated', description: `Successfully generated the latest information for ${selectedCountryName}.` });

        } catch (error: any) {
            console.error("Error generating country intel:", error);
            toast({ variant: 'destructive', title: 'AI Task Failed', description: `${error.message}`, duration: 7000 });
        } finally {
            setIsGeneratingIntel(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle>Location Intel</CardTitle>
                            <CardDescription>Select a country to view standard information, or use our AI agents for the latest updates.</CardDescription>
                        </div>
                        <Dialog>
                            <DialogTrigger asChild><Button variant="outline"><Info className="h-4 w-4 mr-2"/>How "Latest Intel" Works</Button></DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>How "Latest Intel" Works</DialogTitle>
                                    <DialogDescription>Our AI analyst provides a real-time risk assessment for travelers. Here's our robust research process.</DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh] pr-4">
                                    <div className="space-y-4 text-sm py-4">
                                        <p className="text-destructive font-semibold">Disclaimer: While our AI does its best to provide accurate, up-to-date information, it can make mistakes. Always verify critical details with official government sources before making travel decisions.</p>
                                        <p><strong>1. Dual-Tiered Data Gathering:</strong> The agent first performs targeted Google searches against official government sites and reputable news outlets. If a critical web search fails to return recent, relevant results, the agent initiates a fallback: it directly scrapes the content from the primary government source.</p>
                                        <p><strong>2. Source Verification:</strong> The system prioritizes the most current information. For breaking news, it discards articles older than 30 days. For official advisories, it focuses on the latest available data.</p>
                                        <p><strong>3. Scoring and Analysis:</strong> The AI analyzes the verified content to assign a 0-10 severity score to each category. "Red flag" terms like 'war' or 'do not travel' automatically trigger a high severity score for maximum caution.</p>
                                        <p><strong>4. Summarization:</strong> The AI writes a three-paragraph briefing: an overall summary, a breakdown of key issues, and a final recommendation, including a list of key articles reviewed.</p>
                                    </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={handleCountrySelection} value={selectedCountryCode}>
                        <SelectTrigger><SelectValue placeholder="Select a country..." /></SelectTrigger>
                        <SelectContent><ScrollArea className="h-72">{countryOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</ScrollArea></SelectContent>
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
                                {isGeneratingIntel ? <LoaderCircle className="animate-spin mr-2"/> : <Wand2 className="mr-2"/>} Get Latest Intel
                            </Button>
                            <Badge variant="secondary" className="flex items-center gap-1.5 text-base">
                                <Coins className="h-4 w-4 text-amber-500" /> {settings?.infohubAiCost || 10} Tokens
                            </Badge>
                        </div>
                        {(userProfile?.tokenBalance ?? 0) < (settings?.infohubAiCost ?? 10) && <p className="text-destructive text-sm mt-2">Insufficient tokens.</p>}
                    </CardContent>
                </Card>

                 <Tabs value={activeInfoTab} onValueChange={(v) => setActiveInfoTab(v as InfoTab)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="latest"><AlertTriangle className="mr-2"/> Latest</TabsTrigger>
                        <TabsTrigger value="holidays"><Calendar className="mr-2"/> Holidays</TabsTrigger>
                        <TabsTrigger value="etiquette"><Hand className="mr-2"/> Etiquette</TabsTrigger>
                        <TabsTrigger value="visa"><Building2 className="mr-2"/> Visa</TabsTrigger>
                        <TabsTrigger value="emergency"><Phone className="mr-2"/> Emergency</TabsTrigger>
                    </TabsList>
                    <TabsContent value="latest" className="mt-4"><LatestIntelDisplay intel={aiIntel} searchDate={lastSearchDate} /></TabsContent>
                    <TabsContent value="holidays" className="mt-4">
                        <Card>
                             <CardHeader><CardTitle>Major Festivals & Holidays</CardTitle><CardDescription>Standard information for {selectedCountryName}.</CardDescription></CardHeader>
                            <CardContent>
                               {(staticIntel?.publicHolidays?.length) ? <Table><TableHeader><TableRow><TableHead className="w-[200px]">Date</TableHead><TableHead>Holiday</TableHead></TableRow></TableHeader><TableBody>{staticIntel.publicHolidays.map((event, index) => (<TableRow key={`holiday-${index}`}><TableCell className="font-medium">{event.date}</TableCell><TableCell>{event.name}</TableCell></TableRow>))}</TableBody></Table> : <p className="text-sm text-muted-foreground">No standard data available.</p>}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="etiquette" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle>Cultural Etiquette</CardTitle><CardDescription>Standard information for {selectedCountryName}.</CardDescription></CardHeader>
                             <CardContent>
                                {staticIntel?.etiquette ? <ul className="list-disc pl-5 space-y-2 text-sm">{staticIntel.etiquette.map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">No standard data available.</p>}
                             </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="visa" className="mt-4">
                        <Card>
                             <CardHeader><CardTitle>Visa Information</CardTitle><CardDescription>Standard information for {selectedCountryName} - Always verify with an official embassy.</CardDescription></CardHeader>
                            <CardContent><p className="text-sm">{staticIntel?.visaInformation || 'No standard data available.'}</p></CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="emergency" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle>Emergency Numbers</CardTitle><CardDescription>Standard information for {selectedCountryName}.</CardDescription></CardHeader>
                             <CardContent>
                                {staticIntel?.emergencyNumbers?.length ? <Table><TableBody>{staticIntel.emergencyNumbers.map((item, index) => { const parts = item.split(':'); return (<TableRow key={index}><TableCell className="font-medium">{parts.length > 1 ? parts[0] : 'Number'}</TableCell><TableCell className="font-mono text-right">{parts.length > 1 ? parts.slice(1).join(':').trim() : item}</TableCell></TableRow>);})}</TableBody></Table> : <p className="text-sm text-muted-foreground">No standard data available.</p>}
                             </CardContent>
                        </Card>
                    </TabsContent>
                 </Tabs>
                </>
            )}
        </div>
    )
}

function TransportIntelTab() {
    const { toast } = useToast();
    const [fromCity, setFromCity] = useState('');
    const [toCity, setToCity] = useState('');
    const [country, setCountry] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<TransportOption[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    
    const countryOptions = useMemo(() => lightweightCountries.map(c => ({ code: c.name, name: c.name })), []);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResults([]);
        setHasSearched(true);
        try {
            const { options } = await getTransportOptionsAction({ fromCity, toCity, country });
            if (!options || options.length === 0) {
                 toast({ variant: 'default', title: 'No Results', description: 'The AI could not find any transport options for this route.' });
            }
            setResults(options);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Search Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Transport Intelligence</CardTitle>
                    <CardDescription>Find the best ways to get from city to city.</CardDescription>
                </CardHeader>
                <CardContent>
                     <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-end gap-4">
                        <div className="space-y-2 flex-1 w-full">
                            <Label htmlFor="country-select">Country</Label>
                            <Select onValueChange={setCountry} value={country} required>
                                <SelectTrigger><SelectValue placeholder="Select a country..." /></SelectTrigger>
                                <SelectContent><ScrollArea className="h-72">{countryOptions.map(c => <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>)}</ScrollArea></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 flex-1 w-full">
                            <Label htmlFor="fromCity">From City</Label>
                            <Input id="fromCity" value={fromCity} onChange={(e) => setFromCity(e.target.value)} required />
                        </div>
                        <div className="space-y-2 flex-1 w-full">
                            <Label htmlFor="toCity">To City</Label>
                            <Input id="toCity" value={toCity} onChange={(e) => setToCity(e.target.value)} required />
                        </div>
                        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                            {isLoading ? <LoaderCircle className="animate-spin" /> : <Search className="mr-2" />} Search
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {isLoading && <div className="flex justify-center items-center py-10 text-muted-foreground"><LoaderCircle className="h-8 w-8 animate-spin mr-2" /><span>AI is researching options...</span></div>}
                {results.length > 0 && results.map((option, index) => (
                    <Card key={index}><CardContent className="p-4 flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-md">{transportTypeIcons[option.type] || <Car className="h-6 w-6 text-gray-400" />}</div>
                        <div className="flex-1 space-y-1">
                            <h3 className="font-semibold capitalize">{option.type} via {option.company}</h3>
                            <p className="text-sm">Travel Time: <span className="font-medium">{option.estimatedTravelTime}</span></p>
                            <p className="text-sm">Price Range: <span className="font-medium">{option.typicalPriceRange}</span></p>
                        </div>
                        <Button asChild variant="outline" size="sm" disabled={!option.bookingUrl.startsWith('http')}><a href={option.bookingUrl} target="_blank" rel="noopener noreferrer">Book Now</a></Button>
                    </CardContent></Card>
                ))}
                {!isLoading && hasSearched && results.length === 0 && <div className="text-center py-10 text-muted-foreground"><p>No transport options found for this route.</p></div>}
            </div>
        </div>
    );
}


function IntelContent() {
    return (
        <div className="space-y-8">
            <MainHeader title="Intel Hub" description="Your source for global travel and transport intelligence." />
            <Tabs defaultValue="location-intel" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="location-intel"><Compass className="mr-2"/> Location Intel</TabsTrigger>
                    <TabsTrigger value="transport-intel"><Train className="mr-2"/> Transport Intel</TabsTrigger>
                </TabsList>
                <TabsContent value="location-intel" className="mt-6">
                    <LocationIntelTab />
                </TabsContent>
                <TabsContent value="transport-intel" className="mt-6">
                    <TransportIntelTab />
                </TabsContent>
            </Tabs>
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
