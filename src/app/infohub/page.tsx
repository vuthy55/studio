
"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Wand2, AlertTriangle, Calendar, BookUser, ShieldAlert, Phone, Link as LinkIcon, MenuSquare } from 'lucide-react';
import { lightweightCountries, countries as aseanCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { etiquetteData } from '@/lib/etiquette-data';
import { visaData } from '@/lib/visa-data';
import { emergencyData } from '@/lib/emergency-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';


type InfoTab = 'holidays' | 'etiquette' | 'visa' | 'emergency';

export default function InfoHubPage() {
    const { user, loading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();

    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [selectedCountryName, setSelectedCountryName] = useState('');
    const [activeTab, setActiveTab] = useState('holidays');
    
    // State for static data
    const [staticHolidays, setStaticHolidays] = useState<StaticEvent[]>([]);
    const [staticEtiquette, setStaticEtiquette] = useState<string[]>([]);
    const [staticVisa, setStaticVisa] = useState<string>('');
    const [staticEmergency, setStaticEmergency] = useState<{ label: string; number: string }[]>([]);

    // State for AI-generated data
    const [aiIntel, setAiIntel] = useState<CountryIntel | null>(null);
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [isAseanListOpen, setIsAseanListOpen] = useState(false);
    
    const worldCountryOptions = useMemo(() => lightweightCountries.map(c => ({ value: c.code, label: c.name })), []);
    const isAsean = useMemo(() => !!aseanCountries.find(e => e.code === selectedCountryCode), [selectedCountryCode]);

    const handleCountrySelection = (countryCode: string) => {
        setSelectedCountryCode(countryCode);
        const country = worldCountryOptions.find(c => c.value === countryCode);
        setSelectedCountryName(country?.label || '');
        
        setAiIntel(null);
        setActiveTab('holidays');

        setStaticHolidays(staticEvents.filter(e => e.countryCode === countryCode));
        setStaticEtiquette(etiquetteData[countryCode] || []);
        setStaticVisa(visaData[countryCode] || '');

        const emergency = emergencyData[countryCode];
        if (emergency) {
            const emergencyList = [
                { label: 'Police', number: emergency.police },
                { label: 'Ambulance', number: emergency.ambulance },
                { label: 'Fire', number: emergency.fire }
            ];
            if (emergency.touristPolice) {
                emergencyList.push({ label: 'Tourist Police', number: emergency.touristPolice });
            }
            setStaticEmergency(emergencyList);
        } else {
            setStaticEmergency([]);
        }
    };

    const handleAseanQuickSelect = (countryCode: string) => {
        handleCountrySelection(countryCode);
        setIsAseanListOpen(false);
    }
    
    const handleGenerateIntel = async () => {
        if (!selectedCountryName) return;
        
        if (!settings || !userProfile) {
            toast({ variant: 'destructive', title: 'Error', description: 'User data or settings are not available.' });
            return;
        }
        
        setIsGeneratingIntel(true);
        try {
            // First, get the data from the AI
            const intel = await getCountryIntel({ countryName: selectedCountryName });
            
            // THEN, charge the user
            const cost = settings.infohubAiCost || 10;
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedCountryName}`, cost);

            if (!spendSuccess) {
                // This case should be rare since we check balance beforehand, but it's a good safeguard
                throw new Error("Token spending failed post-generation. Your balance may have changed.");
            }
            
            setAiIntel(intel);
            setActiveTab('holidays'); // Switch to the first tab to show new data
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
                    <CardTitle>Location Intel</CardTitle>
                    <CardDescription>
                        For ASEAN countries, view standard travel info for free. For the latest, real-time intel on <strong>any country</strong> (including ASEAN), use our AI-powered advisory service for a token fee.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label>Select Country</Label>
                         <Select value={selectedCountryCode} onValueChange={handleCountrySelection}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a country from the list..." />
                            </SelectTrigger>
                            <SelectContent>
                                <ScrollArea className="h-72">
                                    {worldCountryOptions.map((country) => (
                                        <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
                                    ))}
                                </ScrollArea>
                            </SelectContent>
                        </Select>
                    </div>

                     <div className="text-sm text-muted-foreground">
                        Or, quickly view standard info for an {' '}
                        <Dialog open={isAseanListOpen} onOpenChange={setIsAseanListOpen}>
                            <DialogTrigger asChild>
                                 <Button variant="link" className="p-0 h-auto">ASEAN country</Button>
                            </DialogTrigger>
                             <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Select an ASEAN Country</DialogTitle>
                                    <DialogDescription>
                                        View standard, pre-loaded information for these countries for free.
                                    </DialogDescription>
                                </DialogHeader>
                                 <div className="grid grid-cols-2 gap-2 py-4">
                                    {aseanCountries.map(country => (
                                        <Button key={country.code} variant="outline" onClick={() => handleAseanQuickSelect(country.code)}>
                                            {country.name}
                                        </Button>
                                    ))}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                     {selectedCountryCode && (
                         <div className="p-4 border rounded-lg bg-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-lg">AI-Powered Latest Intel</p>
                                <p className="text-sm text-muted-foreground">Get real-time advisories, scams, and cultural tips for {selectedCountryName}.</p>
                            </div>
                            <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel || !canAffordIntel}>
                                {isGeneratingIntel ? <LoaderCircle className="animate-spin mr-2"/> : <Wand2 className="mr-2"/>}
                                Get Latest Intel ({settings?.infohubAiCost || 10} Tokens)
                            </Button>
                        </div>
                     )}
                </CardContent>
            </Card>

            {selectedCountryCode && (
                 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="holidays"><Calendar className="mr-2"/> Holidays</TabsTrigger>
                        <TabsTrigger value="etiquette"><BookUser className="mr-2"/> Etiquette</TabsTrigger>
                        <TabsTrigger value="visa"><ShieldAlert className="mr-2"/> Visa</TabsTrigger>
                        <TabsTrigger value="emergency"><Phone className="mr-2"/> Emergency</TabsTrigger>
                    </TabsList>

                    <TabsContent value="holidays" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Major Festivals & Holidays</CardTitle>
                                {aiIntel ? <CardDescription>AI-Generated Data</CardDescription> : (isAsean ? <CardDescription>Standard Information</CardDescription> : <CardDescription>Select a country and use AI to fetch data.</CardDescription>)}
                            </CardHeader>
                            <CardContent>
                               <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Event</TableHead>
                                            <TableHead>Description</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(aiIntel?.majorHolidays || (isAsean ? staticHolidays : [])).map((event: any, index: number) => (
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
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="etiquette" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cultural Etiquette</CardTitle>
                                {aiIntel ? <CardDescription>AI-Generated Data</CardDescription> : (isAsean ? <CardDescription>Standard Information</CardDescription> : <CardDescription>Select a country and use AI to fetch data.</CardDescription>)}
                            </CardHeader>
                             <CardContent>
                                <ul className="list-disc pl-5 space-y-2 text-sm">
                                    {(aiIntel?.culturalEtiquette || (isAsean ? staticEtiquette : [])).map((item, index) => <li key={`etiquette-${index}`}>{item}</li>)}
                                </ul>
                             </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="visa" className="mt-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Visa Information</CardTitle>
                                {aiIntel ? <CardDescription>AI-Generated Data</CardDescription> : (isAsean ? <CardDescription>Standard Information - Verify with embassy</CardDescription> : <CardDescription>Select a country and use AI to fetch data.</CardDescription>)}
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm">{aiIntel?.visaInfo || (isAsean ? staticVisa : '')}</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="emergency" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Emergency Numbers</CardTitle>
                                {aiIntel ? <CardDescription>AI-Generated Data</CardDescription> : (isAsean ? <CardDescription>Standard Information</CardDescription> : <CardDescription>Select a country and use AI to fetch data.</CardDescription>)}
                            </CardHeader>
                             <CardContent>
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
                             </CardContent>
                        </Card>
                    </TabsContent>

                 </Tabs>
            )}
        </div>
    )
}
 