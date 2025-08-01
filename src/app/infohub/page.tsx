
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Wand2, AlertTriangle, Sparkles } from 'lucide-react';
import { countries as aseanCountries, lightweightCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { getCountryIntel } from '@/ai/flows/get-country-intel-flow';
import type { CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function IntelCard({ intel, countryName }: { intel: CountryIntel, countryName: string }) {
    if (!intel) return null;
    return (
        <Card className="mt-6 bg-primary/10 border-primary">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="text-primary"/> AI Travel Advisory for {countryName}</CardTitle>
                <CardDescription>This information is AI-generated and should be used as a starting point for your research.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div>
                    <h3 className="font-semibold">Major Holidays & Festivals</h3>
                    <ul className="list-disc pl-5 mt-1 text-sm">
                        {intel.majorHolidays.map((item, index) => <li key={index}><strong>{item.name} ({item.date}):</strong> {item.description}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="font-semibold">Cultural Etiquette</h3>
                    <ul className="list-disc pl-5 mt-1 text-sm">
                        {intel.culturalEtiquette.map((tip, index) => <li key={index}>{tip}</li>)}
                    </ul>
                </div>
                 <div>
                    <h3 className="font-semibold">Common Scams to Avoid</h3>
                    <ul className="list-disc pl-5 mt-1 text-sm">
                        {intel.commonScams.map((scam, index) => <li key={index}>{scam}</li>)}
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}

export default function InfoHubPage() {
    const { user, loading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();

    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [events, setEvents] = useState<StaticEvent[]>([]);

    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [aiIntel, setAiIntel] = useState<CountryIntel | null>(null);
    const [selectedAiCountry, setSelectedAiCountry] = useState('');
    
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    const selectedAseanCountry = useMemo(() => {
        return aseanCountries.find(c => c.code.toLowerCase() === selectedCountryCode.toLowerCase());
    }, [selectedCountryCode]);

    useEffect(() => {
        if (selectedAseanCountry) {
            const countryEvents = staticEvents.filter(e => e.countryCode === selectedAseanCountry.code);
            setEvents(countryEvents);
            setAiIntel(null); // Clear AI intel when selecting a pre-loaded country
            setSelectedAiCountry('');
        } else {
            setEvents([]);
        }
    }, [selectedAseanCountry]);
    
    const handleGenerateIntel = async () => {
        if (!selectedAiCountry) return;
        
        if (!settings || !userProfile) {
            toast({ variant: 'destructive', title: 'Error', description: 'User data or settings are not available.' });
            return;
        }
        
        const cost = settings.infohubAiCost || 10;
        if (userProfile.tokenBalance === undefined || userProfile.tokenBalance < cost) {
            toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens to generate this report.` });
            return;
        }

        setIsGeneratingIntel(true);
        setAiIntel(null);
        setSelectedCountryCode('');
        
        try {
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${selectedAiCountry}`, cost);
            if (!spendSuccess) {
                throw new Error("Token spending failed.");
            }
            const intel = await getCountryIntel({ countryName: selectedAiCountry });
            setAiIntel(intel);
        } catch (error: any) {
            console.error("Error generating country intel:", error);
            toast({ variant: 'destructive', title: 'AI Error', description: error.message || "Could not generate travel intel." });
        } finally {
            setIsGeneratingIntel(false);
        }
    };
    
    const worldCountryOptions = useMemo(() => lightweightCountries.map(c => ({ value: c.name, label: c.name })), []);

    if (loading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <MainHeader title="InfoHub" description="Your source for real-time travel intelligence." />

            <Card>
                <CardHeader>
                    <CardTitle>Location Intel</CardTitle>
                    <CardDescription>Select a pre-loaded ASEAN country to view its major festivals, or use AI to get travel intel for any other country in the world.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>ASEAN Countries (Pre-loaded)</Label>
                                 <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select an ASEAN country..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {aseanCountries.map((country) => (
                                            <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Other Countries (AI-Powered)</Label>
                                <Combobox 
                                    options={worldCountryOptions}
                                    value={selectedAiCountry}
                                    onChange={setSelectedAiCountry}
                                    placeholder="Search for any country..."
                                    searchPlaceholder='Search...'
                                    notfoundText='No country found.'
                                />
                                <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel || !selectedAiCountry} className="w-full mt-2">
                                    {isGeneratingIntel && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                    Get AI Intel (Cost: {settings?.infohubAiCost || 10} Tokens)
                                </Button>
                            </div>
                        </div>
                        <div>
                             {(selectedCountryCode || aiIntel) ? (
                                <Calendar
                                    mode="single"
                                    className="p-0 rounded-md border"
                                    components={{
                                        DayContent: ({ date }) => {
                                            const dailyEvents = events.filter(e => {
                                                const eventDate = new Date(e.date);
                                                return eventDate.getUTCFullYear() === date.getFullYear() &&
                                                    eventDate.getUTCMonth() === date.getMonth() &&
                                                    eventDate.getUTCDate() === date.getDate();
                                            });

                                            return (
                                                <div className="relative h-full w-full flex items-center justify-center">
                                                    <span className="relative z-10">{date.getDate()}</span>
                                                    {dailyEvents.length > 0 && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="absolute bottom-1 w-full flex justify-center items-center gap-0.5">
                                                                        {dailyEvents.slice(0, 3).map((event, index) => (
                                                                            <Badge key={index} className="h-1.5 w-1.5 p-0 bg-primary rounded-full"></Badge>
                                                                        ))}
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <ul className="space-y-1">
                                                                        {dailyEvents.map(event => <li key={event.name}>{event.name}</li>)}
                                                                    </ul>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                            );
                                        },
                                    }}
                                />
                            ) : (
                                <div className="h-full min-h-[300px] flex items-center justify-center border rounded-md bg-muted/50">
                                    <p className="text-muted-foreground">Select a country to see calendar events.</p>
                                </div>
                            )}
                        </div>
                    </div>
                     {aiIntel && <IntelCard intel={aiIntel} countryName={selectedAiCountry} />}
                </CardContent>
            </Card>
        </div>
    )
}
