
"use client";

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Search, Plane, Bus, Train, Car, Ship, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTransportOptionsAction } from '@/actions/transport';
import type { TransportOption } from '@/ai/flows/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lightweightCountries } from '@/lib/location-data';
import { Card, CardContent } from '@/components/ui/card';

const transportTypeIcons: Record<string, React.ReactNode> = {
    flight: <Plane className="h-6 w-6 text-blue-500" />,
    bus: <Bus className="h-6 w-6 text-green-500" />,
    train: <Train className="h-6 w-6 text-red-500" />,
    'ride-sharing': <Car className="h-6 w-6 text-purple-500" />,
    ferry: <Ship className="h-6 w-6 text-cyan-500" />,
    unknown: <Car className="h-6 w-6 text-gray-400" />
};

export default function TransportIntelDialog() {
    const { toast } = useToast();
    const [fromCity, setFromCity] = useState('');
    const [toCity, setToCity] = useState('');
    const [country, setCountry] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<TransportOption[]>([]);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    
    const countryOptions = useMemo(() => lightweightCountries.map(c => ({ code: c.name, name: c.name })), []);


    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResults([]);
        setDebugLog([]);
        setHasSearched(true);
        try {
            const { options, debugLog: log } = await getTransportOptionsAction({
                fromCity,
                toCity,
                country
            });
            setDebugLog(log);
            
            if (!options || options.length === 0) {
                 toast({ variant: 'default', title: 'No Results', description: 'The AI could not find any transport options for this route.' });
            }

            setResults(options);

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Search Failed',
                description: error.message || 'An unexpected error occurred.',
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <Train className="mr-2 h-4 w-4"/>
                    Transport Intel
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>Transport Intelligence</DialogTitle>
                    <DialogDescription>Find the best ways to get from city to city.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-end gap-4 p-4 border rounded-md">
                    <div className="space-y-2 flex-1 w-full">
                        <Label htmlFor="country-select">Country</Label>
                        <Select onValueChange={setCountry} value={country} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a country..." />
                            </SelectTrigger>
                            <SelectContent>
                                <ScrollArea className="h-72">
                                    {countryOptions.map(c => (
                                        <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                                    ))}
                                </ScrollArea>
                            </SelectContent>
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
                        {isLoading ? <LoaderCircle className="animate-spin" /> : <Search className="mr-2" />}
                        Search
                    </Button>
                </form>
                
                <ScrollArea className="h-[50vh]">
                <div className="pr-4 py-4 space-y-4">
                    {isLoading && (
                         <div className="flex justify-center items-center py-10 text-muted-foreground">
                            <LoaderCircle className="h-8 w-8 animate-spin mr-2" />
                            <span>AI is researching options...</span>
                        </div>
                    )}
                    
                    {results.length > 0 && (
                        results.map((option, index) => (
                             <Card key={index}>
                                <CardContent className="p-4 flex items-start gap-4">
                                   <div className="p-2 bg-muted rounded-md">
                                        {transportTypeIcons[option.type] || <Car className="h-6 w-6 text-gray-400" />}
                                   </div>
                                    <div className="flex-1 space-y-1">
                                        <h3 className="font-semibold capitalize">{option.type} via {option.company}</h3>
                                        <p className="text-sm">Travel Time: <span className="font-medium">{option.estimatedTravelTime}</span></p>
                                        <p className="text-sm">Price Range: <span className="font-medium">{option.typicalPriceRange}</span></p>
                                    </div>
                                    <Button asChild variant="outline" size="sm" disabled={!option.bookingUrl.startsWith('http')}>
                                        <a href={option.bookingUrl} target="_blank" rel="noopener noreferrer">
                                            Book Now
                                        </a>
                                    </Button>
                                </CardContent>
                            </Card>
                        ))
                    )}
                    
                    {!isLoading && hasSearched && results.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground">
                            <p>No transport options found for this route.</p>
                        </div>
                    )}
                </div>
                </ScrollArea>
                
            </DialogContent>
        </Dialog>
    )
}
