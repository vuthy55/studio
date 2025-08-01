
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, BookUser, ShieldAlert, Phone, Link as LinkIcon, HelpCircle } from 'lucide-react';
import { lightweightCountries, countries as aseanCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
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
import { Combobox } from '@/components/ui/combobox';
import { useTour, TourStep } from '@/context/TourContext';


const infoHubTourSteps: TourStep[] = [
    {
        selector: '[data-tour="ih-country-selector"]',
        content: 'Start by selecting a country from this list. You can either scroll or type to search.',
    },
    {
        selector: '[data-tour="ih-tabs"]',
        content: 'Information is organized into tabs. For ASEAN countries, standard info is loaded for free. For other countries, these will be empty until you generate AI intel.',
        position: 'bottom'
    },
    {
        selector: '[data-tour="ih-ai-button"]',
        content: 'When you\'re ready for the most up-to-date information, click this button. It will use AI to fetch the latest advisories, holidays, and tips for the selected country for a small token fee.',
        position: 'top'
    }
];

type InfoTab = 'latest' | 'holidays' | 'etiquette' | 'visa' | 'emergency';

export default function InfoHubPage() {
    const { user, loading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();
    const { startTour } = useTour();

    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    
    const [activeTab, setActiveTab] = useState<InfoTab>('latest');
    
    // State for static data
    const [staticHolidays, setStaticHolidays] = useState<StaticEvent[]>([]);
    const [staticEtiquette, setStaticEtiquette] = useState<string[]>([]);
    const [staticVisa, setStaticVisa] = useState<string>('');
    const [staticEmergency, setStaticEmergency] = useState<{ label: string; number: string }[]>([]);

    // State for AI-generated data
    const [aiIntel, setAiIntel] = useState<CountryIntel | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    
    const worldCountryOptions = useMemo(() => lightweightCountries.map(c => ({ value: c.code, label: c.name })), []);
    
    const selectedCountryName = useMemo(() => {
        return worldCountryOptions.find(c => c.value === selectedCountryCode)?.label || '';
    }, [selectedCountryCode, worldCountryOptions]);
    
    const isAsean = useMemo(() => !!aseanCountries.find(e => e.code === selectedCountryCode), [selectedCountryCode]);

    const handleCountrySelection = useCallback((countryCode: string) => {
        if (!countryCode) {
            setSelectedCountryCode('');
            setStaticHolidays([]);
            setStaticEtiquette([]);
            setStaticVisa('');
            setStaticEmergency([]);
            setAiIntel(null);
            return;
        }

        setSelectedCountryCode(countryCode);
        setAiIntel(null); // Clear previous AI intel on new selection
        setActiveTab('latest');

        const isAseanCountry = !!aseanCountries.find(e => e.code === countryCode);
        if (isAseanCountry) {
            setStaticHolidays(staticEvents.filter(e => e.countryCode === countryCode));
            setStaticEtiquette(etiquetteData[countryCode] || []);
            setStaticVisa(visaData[countryCode] || '');
            const emergency = emergencyData[countryCode];
            if (emergency) {
                setStaticEmergency([
                    { label: 'Police', number: emergency.police },
                    { label: 'Ambulance', number: emergency.ambulance },
                    { label: 'Fire', number: emergency.fire },
                    ...(emergency.touristPolice ? [{ label: 'Tourist Police', number: emergency.touristPolice }] : [])
                ]);
            } else {
                setStaticEmergency([]);
            }
        } else {
            setStaticHolidays([]);
            setStaticEtiquette([]);
            setStaticVisa('');
            setStaticEmergency([]);
        }
    }, []);
    
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
            
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);

            if (!spendSuccess) {
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
    
    const canAffordIntel = (userProfile?.tokenBalance || 0) >= (settings?.infohubAiCost || 10);
    
    const aiEmergencyList = useMemo(() => {
        if (!aiIntel?.emergencyNumbers) return [];
        return Object.entries(aiIntel.emergencyNumbers).map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1'),
            number: value
        }));
    }, [aiIntel]);

    if (loading || !user) {
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
                    <CardTitle className="flex items-center gap-2">Location Intel</CardTitle>
                    <CardDescription>
                        For ASEAN countries, view standard travel info for free. For the latest, real-time intel on <strong>any country</strong> (including ASEAN), use our AI-powered advisory service for a token fee.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex flex-col md:flex-row items-center gap-4">
                         <div className="w-full md:w-1/2" data-tour="ih-country-selector">
                            <Label>Select Country</Label>
                            <Combobox
                                options={worldCountryOptions}
                                value={selectedCountryCode}
                                onChange={handleCountrySelection}
                                placeholder="Select or search for any country..."
                                searchPlaceholder='Search countries...'
                                notfoundText='No country found.'
                            />
                        </div>
                        {selectedCountryCode && (
                             <div className="w-full md:w-1/2" data-tour="ih-ai-button">
                                <Label className="block h-5">&nbsp;</Label>
                                <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel || !canAffordIntel} className="w-full">
                                    {isGeneratingIntel ? <LoaderCircle className="animate-spin mr-2"/> : <Wand2 className="mr-2"/>}
                                    Get Latest AI Intel ({settings?.infohubAiCost || 10} Tokens)
                                </Button>
                            </div>
                        )}
                     </div>
                      <div className="flex flex-col items-center gap-4 text-center mt-4">
                        <Button onClick={() => startTour(infoHubTourSteps)} size="sm" variant="outline">
                            <HelpCircle className="mr-2" />
                            Take a Tour
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {selectedCountryCode && (
                 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InfoTab)} className="w-full" data-tour="ih-tabs">
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
                                    {aiIntel ? 'AI-Generated Data' : isAsean ? 'Standard Information' : 'Use AI to fetch data'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                               {((aiIntel?.majorHolidays && aiIntel.majorHolidays.length > 0) || (isAsean && staticHolidays.length > 0)) ? (
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
                                   <p className="text-sm text-muted-foreground">No standard data available. Use AI to fetch data.</p>
                               )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="etiquette" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cultural Etiquette</CardTitle>
                                <CardDescription>
                                    {aiIntel ? 'AI-Generated Data' : isAsean ? 'Standard Information' : 'Use AI to fetch data'}
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                {((aiIntel?.culturalEtiquette && aiIntel.culturalEtiquette.length > 0) || (isAsean && staticEtiquette.length > 0)) ? (
                                    <ul className="list-disc pl-5 space-y-2 text-sm">
                                        {(aiIntel?.culturalEtiquette || staticEtiquette).map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No standard data available. Use AI to fetch data.</p>
                                )}
                             </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="visa" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Visa Information</CardTitle>
                                <CardDescription>
                                    {aiIntel ? 'AI-Generated Data' : isAsean ? 'Standard Information - Verify with embassy' : 'Use AI to fetch data'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <p className="text-sm">{aiIntel?.visaInfo || staticVisa || 'No standard data available. Use AI to fetch data.'}</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="emergency" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Emergency Numbers</CardTitle>
                                 <CardDescription>
                                    {aiIntel ? 'AI-Generated Data' : isAsean ? 'Standard Information' : 'Use AI to fetch data'}
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                {((aiIntel && aiEmergencyList.length > 0) || (isAsean && staticEmergency.length > 0)) ? (
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
                                     <p className="text-sm text-muted-foreground">No standard data available. Use AI to fetch data.</p>
                                 )}
                             </CardContent>
                        </Card>
                    </TabsContent>

                 </Tabs>
            )}
        </div>
    )
}
