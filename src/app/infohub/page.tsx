
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Wand2, AlertTriangle, Sparkles, Link as LinkIcon } from 'lucide-react';
import { countries as aseanCountries, lightweightCountries } from '@/lib/location-data';
import { staticEvents, type StaticEvent } from '@/lib/events-data';
import { getCountryIntel, type CountryIntel } from '@/ai/flows/get-country-intel-flow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import Link from 'next/link';

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

function EventsTable({ events }: { events: StaticEvent[] }) {
    if (events.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                <p>No major festivals or holidays found for this country in our database.</p>
            </div>
        )
    }

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Major Festivals & Holidays</CardTitle>
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
                        {events.map((event, index) => (
                            <TableRow key={index}>
                                <TableCell className="whitespace-nowrap">{format(new Date(event.date), 'MMMM d')}</TableCell>
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
    )
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
    
    // State for the AI generation dialog
    const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
    const [dialogSelectedCountry, setDialogSelectedCountry] = useState('');

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
            setAiIntel(null); 
            setSelectedAiCountry('');
        } else {
            setEvents([]);
        }
    }, [selectedAseanCountry]);
    
    const handleMainSelection = (value: string) => {
        if (value === 'other') {
            setIsAiDialogOpen(true);
            setDialogSelectedCountry('');
        } else {
            setSelectedCountryCode(value);
            setAiIntel(null);
            setSelectedAiCountry('');
        }
    };

    const handleGenerateIntel = async () => {
        if (!dialogSelectedCountry) return;
        
        if (!settings || !userProfile) {
            toast({ variant: 'destructive', title: 'Error', description: 'User data or settings are not available.' });
            return;
        }
        
        const cost = settings.infohubAiCost || 10;
        if ((userProfile.tokenBalance || 0) < cost) {
            toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens to generate this report.` });
            return;
        }

        setIsGeneratingIntel(true);
        setIsAiDialogOpen(false); 
        setAiIntel(null);
        setSelectedCountryCode('');
        const countryLabel = lightweightCountries.find(c => c.name === dialogSelectedCountry)?.name || dialogSelectedCountry;
        setSelectedAiCountry(countryLabel);
        
        try {
            const spendSuccess = spendTokensForTranslation(`Generated travel intel for ${dialogSelectedCountry}`, cost);
            if (!spendSuccess) {
                throw new Error("Token spending failed.");
            }
            const intel = await getCountryIntel({ countryName: dialogSelectedCountry });
            setAiIntel(intel);
        } catch (error: any) {
            console.error("Error generating country intel:", error);
            toast({ variant: 'destructive', title: 'AI Error', description: error.message || "Could not generate travel intel." });
            setSelectedAiCountry('');
        } finally {
            setIsGeneratingIntel(false);
            setDialogSelectedCountry(''); // Reset dialog selection
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
                     <div className="space-y-2">
                        <Label>Select Country</Label>
                         <Select value={selectedCountryCode} onValueChange={handleMainSelection}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a country..." />
                            </SelectTrigger>
                            <SelectContent>
                                <ScrollArea className="h-72">
                                    {aseanCountries.map((country) => (
                                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                    ))}
                                    <SelectItem value="other">Other (AI-Powered {settings?.infohubAiCost || 10} Tokens)...</SelectItem>
                                </ScrollArea>
                            </SelectContent>
                        </Select>
                    </div>

                     <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Get AI-Powered Travel Intel</DialogTitle>
                                <DialogDescription>
                                    Select any country from the list below to generate a travel advisory using AI.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <Label>Country</Label>
                                <Select value={dialogSelectedCountry} onValueChange={setDialogSelectedCountry}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select from all countries..." />
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
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="ghost">Cancel</Button>
                                </DialogClose>
                                <Button onClick={handleGenerateIntel} disabled={!dialogSelectedCountry || isGeneratingIntel}>
                                    {isGeneratingIntel && <LoaderCircle className="animate-spin mr-2"/>}
                                    Get Intel (Cost: {settings?.infohubAiCost || 10} Tokens)
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            {isGeneratingIntel && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground p-4">
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    <span>Generating intel for {selectedAiCountry}...</span>
                </div>
            )}
            {aiIntel && <IntelCard intel={aiIntel} countryName={selectedAiCountry} />}
            {selectedCountryCode && <EventsTable events={events} />}
        </div>
    )
}
