
"use client";

import React, { useState } from 'react';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Search, Plane, Bus, Train, Car, Ship, FileText, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTransportOptionsAction } from '@/actions/transport';
import type { TransportOption } from '@/ai/flows/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const getCompanyIcon = (company: string): React.ReactNode => {
    const lowerCaseCompany = company.toLowerCase();
    if (lowerCaseCompany.includes('airasia')) return <Image src="https://upload.wikimedia.org/wikipedia/commons/f/f5/AirAsia_New_Logo.svg" alt="AirAsia" width={24} height={24} className="rounded-full" />;
    if (lowerCaseCompany.includes('malaysia airlines')) return <Image src="https://upload.wikimedia.org/wikipedia/commons/3/33/Malaysia_Airlines_logo.svg" alt="Malaysia Airlines" width={24} height={24} />;
    if (lowerCaseCompany.includes('firefly')) return <Image src="https://upload.wikimedia.org/wikipedia/en/c/cb/Firefly_logo.svg" alt="Firefly" width={24} height={24}/>;
    if (lowerCaseCompany.includes('batik air')) return <Image src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Batik_Air_logo.svg" alt="Batik Air" width={24} height={24}/>;
    if (lowerCaseCompany.includes('singapore airlines')) return <Image src="https://upload.wikimedia.org/wikipedia/en/thumb/9/9d/Singapore_Airlines_Logo.svg/1200px-Singapore_Airlines_Logo.svg.png" alt="Singapore Airlines" width={24} height={24}/>;
    if (lowerCaseCompany.includes('ktm') || lowerCaseCompany.includes('ets')) return <Train className="h-6 w-6 text-blue-600" />;
    if (lowerCaseCompany.includes('bus')) return <Bus className="h-6 w-6 text-green-500" />;
    return <Building className="h-6 w-6 text-gray-500" />;
};

const transportTypeIcons: Record<string, React.ReactNode> = {
    flight: <Plane className="h-6 w-6 text-blue-500" />,
    bus: <Bus className="h-6 w-6 text-green-500" />,
    train: <Train className="h-6 w-6 text-red-500" />,
    'ride-sharing': <Car className="h-6 w-6 text-purple-500" />,
    ferry: <Ship className="h-6 w-6 text-cyan-500" />,
    unknown: <Building className="h-6 w-6 text-gray-400" />
};

export default function TestTransportPage() {
    const { toast } = useToast();
    const [fromCity, setFromCity] = useState('Kuala Lumpur');
    const [toCity, setToCity] = useState('Penang');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<TransportOption[]>([]);
    const [debugLog, setDebugLog] = useState<string[]>([]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResults([]);
        setDebugLog([]);
        try {
            const { options, debugLog: log } = await getTransportOptionsAction({
                fromCity,
                toCity,
                country: 'Malaysia'
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
        <div className="space-y-8">
            <MainHeader title="Transport Intel Test" description="A testbed for the AI transport research agent." />

            <Card>
                <CardHeader>
                    <CardTitle>Find Transport in Malaysia</CardTitle>
                    <CardDescription>Enter a start and end city to find transport options.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-end gap-4">
                        <div className="space-y-2 flex-1 w-full">
                            <Label htmlFor="fromCity">From</Label>
                            <Input id="fromCity" value={fromCity} onChange={(e) => setFromCity(e.target.value)} required />
                        </div>
                        <div className="space-y-2 flex-1 w-full">
                            <Label htmlFor="toCity">To</Label>
                            <Input id="toCity" value={toCity} onChange={(e) => setToCity(e.target.value)} required />
                        </div>
                        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                            {isLoading ? <LoaderCircle className="animate-spin" /> : <Search className="mr-2" />}
                            Search
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {isLoading && (
                 <div className="flex justify-center items-center py-10 text-muted-foreground">
                    <LoaderCircle className="h-8 w-8 animate-spin mr-2" />
                    <span>AI is researching options...</span>
                </div>
            )}
            
            {results.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Results for {fromCity} to {toCity}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {results.map((option, index) => (
                             <Card key={index}>
                                <CardContent className="p-4 flex items-start gap-4">
                                   <div className="p-2 bg-muted rounded-md">
                                        {option.type === 'flight' ? getCompanyIcon(option.company) : transportTypeIcons[option.type]}
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
                        ))}
                    </CardContent>
                </Card>
            )}

            {debugLog.length > 0 && (
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="debug-log">
                        <AccordionTrigger>
                            <div className="flex items-center gap-2">
                                <FileText />
                                <h4 className="text-lg font-semibold">Debug Log</h4>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                           <ScrollArea className="h-72 p-4 border rounded-md bg-muted font-mono text-xs">
                                {debugLog.map((log, index) => (
                                    <p key={index} className={cn(
                                        "whitespace-pre-wrap",
                                        log.includes('[CRITICAL]') && 'text-destructive font-bold',
                                        log.includes('[WARN]') && 'text-amber-600'
                                        )}>
                                        {log}
                                    </p>
                                ))}
                            </ScrollArea>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
        </div>
    );
}
