
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, BookUser, ShieldAlert, Phone, Link as LinkIcon, Hand, Coins, Briefcase, Syringe, Building2 } from 'lucide-react';
import { lightweightCountries } from '@/lib/location-data';
import { staticEvents } from '@/lib/events-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { etiquetteData } from '@/lib/etiquette-data';
import { visaData } from '@/lib/visa-data';
import { emergencyData } from '@/lib/emergency-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

function LatestIntelDisplay({ intel }: { intel: Partial<CountryIntel> | null }) {
    if (!intel) {
        return <p className="text-sm text-center text-muted-foreground py-8">Use "Get Latest Intel" to search for real-time information.</p>;
    }

    if (Object.values(intel).every(value => !value || (Array.isArray(value) && value.length === 0))) {
        return <p className="text-sm text-center text-muted-foreground py-8">No specific advisories found by the AI. Exercise normal precautions.</p>;
    }

    const renderIntelList = (items: {summary: string; source: string}[]) => {
        if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">No specific information found for this category.</p>;

        return (
            <ul className="space-y-4">
                {items.map((item, index) => (
                    <li key={index} className="space-y-1">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.summary}</p>
                        <a href={item.source} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" />
                            Source
                        </a>
                    </li>
                ))}
            </ul>
        )
    }

    return (
        <div className="space-y-6">
            {intel.latestAdvisory && intel.latestAdvisory.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Official Advisories</h3>
                    {renderIntelList(intel.latestAdvisory)}
                </div>
            )}
             {intel.scams && intel.scams.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> Scams & Fraud</h3>
                     {renderIntelList(intel.scams)}
                </div>
            )}
            {intel.theft && intel.theft.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><BookUser className="h-5 w-5 text-primary" /> Theft & Safety</h3>
                    {renderIntelList(intel.theft)}
                </div>
            )}
             {intel.health && intel.health.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Syringe className="h-5 w-5 text-primary" /> Health & Disease</h3>
                     {renderIntelList(intel.health)}
                </div>
            )}
            {intel.political && intel.political.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Political Situation</h3>
                     {renderIntelList(intel.political)}
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
    
    const countryOptions = useMemo(() => lightweightCountries, []);

    const selectedCountryName = useMemo(() => {
        return countryOptions.find(c => c.code === selectedCountryCode)?.name || '';
    }, [selectedCountryCode, countryOptions]);

    // Static data memoization
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
    
    // Derived data sources for rendering
    const holidays = useMemo(() => staticHolidays, [staticHolidays]);
    const etiquette = useMemo(() => staticEtiquette, [staticEtiquette]);
    const visa = useMemo(() => staticVisa, [staticVisa]);
    const emergencyList = useMemo(() => staticEmergency, [staticEmergency]);

    const handleCountrySelection = (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        setAiIntel(null);
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
        try {
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);
            if (!spendSuccess) {
                throw new Error("Token spending failed. Your balance may have changed.");
            }
            
            const intel = await getCountryIntel({ 
                countryName: selectedCountryName,
            });

            if (!intel || Object.keys(intel).length === 0) {
                 throw new Error("The AI returned an empty response. Please try again.");
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

    // Helper function to safely format dates
    const formatDateSafely = (dateString: string) => {
        // Check for YYYY-MM-DD format specifically for static data
        if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
            try {
                return format(new Date(dateString), 'MMMM d');
            } catch (e) {
                return dateString; // Fallback for invalid but matching formats
            }
        }
        // For other formats (like "Late January" from AI), just return the string
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
                    <CardTitle>Location Intel</CardTitle>
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
                                    <LatestIntelDisplay intel={aiIntel} />
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
                               {holidays.length > 0 ? (
                                   <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Event</TableHead>
                                                <TableHead>Description</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {holidays.map((event: any, index: number) => (
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
                                {etiquette.length > 0 ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {etiquette.map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
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
                                 <p className="text-sm">{visa || 'No standard data available for this country.'}</p>
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
                                {emergencyList.length > 0 ? (
                                 <Table>
                                    <TableBody>
                                        {emergencyList.map((item, index) => (
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
