
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Wand2, AlertTriangle, Sparkles } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { countries as aseanCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Create a comprehensive list of countries for the combobox
const allCountriesForSearch = aseanCountries.map(c => ({ value: c.code, label: c.name }));

export default function InfoHubPage() {
    const { user, loading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();

    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [selectedProvince, setSelectedProvince] = useState('');

    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [events, setEvents] = useState<StaticEvent[]>([]);
    
    const [isGeneratingIntel, setIsGeneratingIntel] = useState(false);
    const [aiIntel, setAiIntel] = useState<CountryIntel | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    const selectedAseanCountry = useMemo(() => {
        return aseanCountries.find(c => c.code.toLowerCase() === selectedCountryCode.toLowerCase());
    }, [selectedCountryCode]);

    const selectedCountryName = useMemo(() => {
        return allCountriesForSearch.find(c => c.value.toLowerCase() === selectedCountryCode.toLowerCase())?.label || selectedCountryCode;
    }, [selectedCountryCode]);

    useEffect(() => {
        setAiIntel(null); // Clear AI intel when country changes
        if (selectedAseanCountry) {
            const countryEvents = staticEvents.filter(e => e.countryCode === selectedAseanCountry.code);
            setEvents(countryEvents);
        } else {
            setEvents([]);
        }
    }, [selectedAseanCountry]);
    
    const handleGenerateIntel = async () => {
      if (!selectedCountryCode || selectedAseanCountry) return;
      
      const cost = settings?.infohubAiCost || 10;
      if (!spendTokensForTranslation(`AI Intel for ${selectedCountryName}`, cost)) {
        toast({
          variant: 'destructive',
          title: 'Insufficient Tokens',
          description: `You need ${cost} tokens to generate travel intel.`,
        });
        return;
      }
      
      setIsGeneratingIntel(true);
      setAiIntel(null);
      try {
        const intel = await getCountryIntel({ countryName: selectedCountryName });
        setAiIntel(intel);
      } catch (error: any) {
        console.error("Error generating AI intel:", error);
        toast({
          variant: 'destructive',
          title: 'AI Generation Failed',
          description: error.message || 'Could not generate travel intel for this country.',
        });
      } finally {
        setIsGeneratingIntel(false);
      }
    };


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
                    <CardDescription>Select a country to get the latest travel advisories, safety alerts, and local events.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                     <Combobox
                        options={allCountriesForSearch}
                        value={selectedCountryCode}
                        onChange={setSelectedCountryCode}
                        placeholder="Select a country..."
                        searchPlaceholder="Search country..."
                        notfoundText="No country found."
                    />
                     {selectedAseanCountry && (
                        <Combobox
                            options={selectedAseanCountry.provinces.map(p => ({ value: p.toLowerCase(), label: p }))}
                            value={selectedProvince}
                            onChange={setSelectedProvince}
                            placeholder="Select an area..."
                            searchPlaceholder="Search area..."
                            notfoundText="No area found."
                        />
                     )}
                </CardContent>
                 {!selectedAseanCountry && selectedCountryCode && (
                    <CardFooter>
                        <Button onClick={handleGenerateIntel} disabled={isGeneratingIntel}>
                            {isGeneratingIntel ? <LoaderCircle className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
                            Generate AI Intel (Cost: {settings?.infohubAiCost || 10} Tokens)
                        </Button>
                    </CardFooter>
                )}
            </Card>

            {aiIntel && (
                <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Sparkles className="text-primary"/> AI Travel Advisory for {selectedCountryName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h3 className="font-semibold text-lg mb-2">Cultural Etiquette</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                {aiIntel.culturalEtiquette.map((tip, i) => <li key={`etiquette-${i}`}>{tip}</li>)}
                            </ul>
                        </div>
                         <div>
                            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><AlertTriangle className="text-destructive" /> Common Scams to Avoid</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                {aiIntel.commonScams.map((scam, i) => <li key={`scam-${i}`}>{scam}</li>)}
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {selectedAseanCountry && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Event Calendar</CardTitle>
                        <CardDescription>Major festivals and events for {selectedAseanCountry.name}.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                    <Calendar
                            mode="single"
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            className="p-0"
                            components={{
                                DayContent: ({ date }) => {
                                    const dailyEvents = events.filter(e => {
                                        const eventDate = new Date(e.date);
                                        return eventDate.getUTCFullYear() === date.getFullYear() &&
                                            eventDate.getUTCMonth() === date.getMonth() &&
                                            eventDate.getUTCDate() === date.getDate();
                                    });

                                    return (
                                        <div className="relative h-full w-full">
                                            <span className="relative z-10">{date.getDate()}</span>
                                            {dailyEvents.length > 0 && (
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full flex justify-center items-center gap-0.5">
                                                    {dailyEvents.slice(0, 3).map((event, index) => (
                                                        <Badge key={index} className="h-1.5 w-1.5 p-0 bg-primary rounded-full"></Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                },
                            }}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
