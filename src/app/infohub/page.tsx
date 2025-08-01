
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Wand2, AlertTriangle, Sparkles } from 'lucide-react';
import { countries as aseanCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { getCountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';


export default function InfoHubPage() {
    const { user, loading, userProfile, settings, spendTokensForTranslation } = useUserData();
    const router = useRouter();
    const { toast } = useToast();

    const [selectedCountryCode, setSelectedCountryCode] = useState('');
    const [events, setEvents] = useState<StaticEvent[]>([]);
    
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
        } else {
            setEvents([]);
        }
    }, [selectedAseanCountry]);
    
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
                    <CardDescription>Select a country to view its major festivals and events on the calendar.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    <RadioGroup 
                        value={selectedCountryCode} 
                        onValueChange={setSelectedCountryCode}
                        className="grid grid-cols-2 gap-2"
                    >
                        {aseanCountries.map((country) => (
                             <div className="flex items-center space-x-2" key={country.code}>
                                <RadioGroupItem value={country.code} id={country.code} />
                                <Label htmlFor={country.code}>{country.name}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                    
                     {selectedCountryCode && (
                         <Calendar
                            mode="single"
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
                     )}
                </CardContent>
            </Card>
        </div>
    )
}
