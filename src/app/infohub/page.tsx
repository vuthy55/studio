
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { countries, type Country } from '@/lib/location-data';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { LoaderCircle } from 'lucide-react';

export default function InfoHubPage() {
    const { user, loading } = useUserData();
    const router = useRouter();
    const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
    const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [events, setEvents] = useState<StaticEvent[]>([]);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    useEffect(() => {
        if (selectedCountry) {
            const countryEvents = staticEvents.filter(e => e.countryCode === selectedCountry.code);
            setEvents(countryEvents);
        } else {
            setEvents([]);
        }
    }, [selectedCountry]);
    
    const handleCountryChange = (countryCode: string) => {
        const country = countries.find(c => c.code === countryCode);
        setSelectedCountry(country || null);
        setSelectedProvince(null); 
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
                    <CardDescription>Select a country and province to get the latest travel advisories, safety alerts, and local events.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="country-select">Country</Label>
                            <Select onValueChange={handleCountryChange} value={selectedCountry?.code || ''}>
                                <SelectTrigger id="country-select">
                                    <SelectValue placeholder="Select a country..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {countries.map(c => (
                                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="province-select">Province / Area</Label>
                            <Select onValueChange={setSelectedProvince} value={selectedProvince || ''} disabled={!selectedCountry}>
                                <SelectTrigger id="province-select">
                                    <SelectValue placeholder={selectedCountry ? "Select an area..." : "First, select a country"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {selectedCountry?.provinces.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Event Calendar</CardTitle>
                    <CardDescription>Major festivals and events for the selected country.</CardDescription>
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
        </div>
    )
}
