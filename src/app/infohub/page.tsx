
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, BookUser, ShieldAlert, Phone, Link as LinkIcon } from 'lucide-react';
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
import type { LanguageCode } from '@/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

const aseanCountryCodes = ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN'];

type InfoTab = 'latest' | 'holidays' | 'etiquette' | 'visa' | 'emergency';

export default function InfoHubPage() {
    const { user, loading: authLoading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();
    
    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [activeTab, setActiveTab] = useState<InfoTab>('latest');
    
    const [aiIntel, setAiIntel] = useState<CountryIntel | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    
    const countryOptions = useMemo(() => lightweightCountries, []);

    const selectedCountryName = useMemo(() => {
        return countryOptions.find(c => c.code === selectedCountryCode)?.name || '';
    }, [selectedCountryCode, countryOptions]);

    const isAseanCountry = useMemo(() => aseanCountryCodes.includes(selectedCountryCode), [selectedCountryCode]);

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
    
     const aiEmergencyList = useMemo(() => {
        if (!aiIntel?.emergencyNumbers) return [];
        return Object.entries(aiIntel.emergencyNumbers).map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').trim(),
            number: value
        }));
    }, [aiIntel]);

    const handleCountrySelection = (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        setAiIntel(null); // Reset AI intel when country changes
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
        try {
            const intel = await getCountryIntel({ countryName: selectedCountryName });
            
            // Only spend tokens after successful generation
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);

            if (!spendSuccess) {
                // This case should be rare since we check balance before, but it's a good safeguard
                throw new Error("Token spending failed post-generation. Your balance may have changed.");
            }
            
            setAiIntel(intel);
            setActiveTab('latest');
            toast({ title: 'Intel Generated', description: `Successfully generated the latest advisory for ${selectedCountryName}.` });
        } catch (error: any) {
            console.error("Error generating country intel:", error);
            toast({ variant: 'destructive', title: 'AI Error', description: error.message || "Could not generate travel intel." });
        } finally {
            setIsGeneratingIntel(false);
        }
    };
    
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
        <div className="space-y-8">
            <MainHeader title="InfoHub" description="Your source for global travel intelligence." />
            
            <Card>
                <CardHeader>
                    <CardTitle>Location Intel</CardTitle>
                    <CardDescription>
                        Select a country to view standard information, or use our AI to get the latest travel advisories.
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
                        <CardTitle>AI-Powered Intel for {selectedCountryName}</CardTitle>
                        <CardDescription>Click the button below to get the latest, real-time travel advisories, scams, and cultural tips for your selected country.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel || (userProfile?.tokenBalance ?? 0) < (settings?.infohubAiCost ?? 10)}>
                            {isGeneratingIntel ? <LoaderCircle className="animate-spin mr-2"/> : <Wand2 className="mr-2"/>}
                            Get Latest AI Intel ({settings?.infohubAiCost || 10} Tokens)
                        </Button>
                        {(userProfile?.tokenBalance ?? 0) < (settings?.infohubAiCost ?? 10) && <p className="text-destructive text-sm mt-2">Insufficient tokens.</p>}
                    </CardContent>
                </Card>

                 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InfoTab)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="latest"><AlertTriangle className="mr-2"/> Latest</TabsTrigger>
                        <TabsTrigger value="holidays"><Calendar className="mr-2"/> Holidays</TabsTrigger>
                        <TabsTrigger value="etiquette"><BookUser className="mr-2"/> Etiquette</TabsTrigger>
                        <TabsTrigger value="visa"><ShieldAlert className="mr-2"/> Visa</TabsTrigger>
                        <TabsTrigger value="emergency"><Phone className="mr-2"/> Emergency</TabsTrigger>
                    </TabsList>

                    <TabsContent value="latest" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Latest Advisories & Scams</CardTitle>
                                <CardDescription>This information is generated by AI and reflects recent data.</CardDescription>
                            </CardHeader>
                            <CardContent>
                               {isGeneratingIntel ? (
                                    <div className="flex justify-center items-center py-8">
                                        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                                        <p className="ml-2 text-muted-foreground">Generating latest intel...</p>
                                    </div>
                                ) : aiIntel?.latestAdvisory && aiIntel.latestAdvisory.length > 0 ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {aiIntel.latestAdvisory.map((item, index) => <li key={`advisory-${index}`}>{item}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Use "Get Latest AI Intel" to view advisories.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="holidays" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Major Festivals & Holidays</CardTitle>
                                <CardDescription>
                                    {aiIntel ? 'AI-Generated Data' : isAseanCountry ? 'Standard Information' : 'Use AI to fetch data for non-ASEAN countries.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                               {(aiIntel?.majorHolidays && aiIntel.majorHolidays.length > 0) || (isAseanCountry && staticHolidays.length > 0) ? (
                                   <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Event</TableHead>
                                                <TableHead>Description</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(aiIntel?.majorHolidays || staticHolidays).map((event: any, index: number) => (
                                                <TableRow key={index}>
                                                    <TableCell className="whitespace-nowrap">{aiIntel ? event.date : format(new Date(event.date), 'MMMM d')}</TableCell>
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
                                   <p className="text-sm text-muted-foreground">No standard data available. Use the AI feature to fetch information for this country.</p>
                               )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="etiquette" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cultural Etiquette</CardTitle>
                                <CardDescription>
                                     {aiIntel ? 'AI-Generated Data' : isAseanCountry ? 'Standard Information' : 'Use AI to fetch data for non-ASEAN countries.'}
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                {((aiIntel?.culturalEtiquette && aiIntel.culturalEtiquette.length > 0) || (isAseanCountry && staticEtiquette.length > 0)) ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {(aiIntel?.culturalEtiquette || staticEtiquette).map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No standard data available. Use the AI feature to fetch information for this country.</p>
                                )}
                             </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="visa" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Visa Information</CardTitle>
                                <CardDescription>
                                     {aiIntel ? 'AI-Generated Data' : isAseanCountry ? 'Standard Information - Verify with embassy' : 'Use AI to fetch data for non-ASEAN countries.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <p className="text-sm">{aiIntel?.visaInfo || (isAseanCountry ? staticVisa : 'No standard data available. Use AI to fetch data for this country.')}</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="emergency" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Emergency Numbers</CardTitle>
                                 <CardDescription>
                                    {aiIntel ? 'AI-Generated Data' : isAseanCountry ? 'Standard Information' : 'Use AI to fetch data for non-ASEAN countries.'}
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                {((aiIntel && aiEmergencyList.length > 0) || (isAseanCountry && staticEmergency.length > 0)) ? (
                                 <Table>
                                    <TableBody>
                                        {(aiIntel ? aiEmergencyList : staticEmergency).map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium capitalize">{item.label}</TableCell>
                                                <TableCell className="font-mono">{item.number}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                 </Table>
                                 ) : (
                                     <p className="text-sm text-muted-foreground">No standard data available. Use AI to fetch data for this country.</p>
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
