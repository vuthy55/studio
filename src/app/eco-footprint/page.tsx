

"use client";

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, FlaskConical, Leaf, Bot, ExternalLink, Info, TreePine, Recycle, Anchor, PlusCircle, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { calculateEcoFootprintAction } from '@/actions/eco-intel';
import type { EcoFootprintOutput } from '@/ai/flows/types';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lightweightCountries } from '@/lib/location-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCountryEcoIntel } from '@/actions/eco-intel-admin';
import type { CountryEcoIntel } from '@/lib/types';


const activityTypeIcons: Record<string, React.ReactNode> = {
    tree_planting: <TreePine className="h-4 w-4 text-green-600" />,
    coral_planting: <Anchor className="h-4 w-4 text-blue-600" />,
    recycling: <Recycle className="h-4 w-4 text-purple-600" />,
    conservation: <Leaf className="h-4 w-4 text-teal-600" />,
    other: <PlusCircle className="h-4 w-4 text-gray-500" />,
    wildlife_sanctuary: <i className="fas fa-paw text-orange-600"></i>, // Placeholder, requires FontAwesome or similar
    jungle_trekking: <i className="fas fa-hiking text-lime-600"></i>,
    community_visit: <i className="fas fa-users text-indigo-600"></i>,
    bird_watching: <i className="fas fa-binoculars text-sky-600"></i>,
};


function EcoTourismTab({ countryCode, countryName }: { countryCode: string; countryName: string; }) {
    const [ecoIntel, setEcoIntel] = useState<CountryEcoIntel | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!countryCode) return;
        setIsLoading(true);
        getCountryEcoIntel(countryCode)
            .then(data => setEcoIntel(data))
            .catch(err => console.error("Failed to load eco-tourism data", err))
            .finally(() => setIsLoading(false));
    }, [countryCode]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    const opportunities = ecoIntel?.ecoTourismOpportunities || [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Eco-Tourism in {countryName}</CardTitle>
                <CardDescription>Discover sustainable and responsible travel opportunities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 {opportunities.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No specific eco-tourism opportunities found in our database for this country.</p>
                 ) : (
                    opportunities.map((opp, index) => (
                         <a href={opp.bookingUrl} target="_blank" rel="noopener noreferrer" key={index} className="block p-4 rounded-lg border hover:bg-muted/50">
                            <div className="flex items-center gap-4">
                                <div>{activityTypeIcons[opp.category] || <Leaf className="h-6 w-6 text-green-600" />}</div>
                                <div className="flex-1">
                                    <h4 className="font-semibold">{opp.name}</h4>
                                    <p className="text-sm text-muted-foreground">{opp.description}</p>
                                </div>
                                {opp.bookingUrl && <Button variant="outline" size="sm" asChild onClick={e => e.stopPropagation()}><Link href={opp.bookingUrl} target="_blank">Book <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>}
                            </div>
                         </a>
                    ))
                 )}
            </CardContent>
        </Card>
    );
}

function EcoFootprintCalculator() {
    const { user, settings } = useUserData();
    const { toast } = useToast();
    const [travelDescription, setTravelDescription] = useState('');
    const [destinationCountryCode, setDestinationCountryCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<EcoFootprintOutput | null>(null);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    
    const countryOptions = useMemo(() => lightweightCountries, []);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!travelDescription.trim() || !destinationCountryCode || !user) {
            toast({ variant: 'destructive', title: 'Input Required', description: 'Please describe your journey and select a primary destination.' });
            return;
        }

        setIsLoading(true);
        setResult(null);
        setDebugLog([]);

        try {
            const { result: calculationResult, debugLog: log, error } = await calculateEcoFootprintAction({ travelDescription, destinationCountryCode }, user.uid);
            
            setDebugLog(log || []);

            if (error) {
                 throw new Error(error);
            }
            
            setResult(calculationResult || null);
            
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Calculation Failed', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Eco-Footprint Calculator</CardTitle>
                    <CardDescription>
                        Describe your trip, and our AI agent will estimate its carbon footprint and suggest ways to offset it.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="p-4 border-l-4 border-blue-500 bg-blue-500/10 text-sm text-blue-800 rounded-r-lg">
                            <p><strong className="font-semibold">For the best results, please include:</strong></p>
                            <ul className="list-disc pl-5 mt-1">
                                <li>Modes of transport (e.g., plane, bus, taxi, tuk-tuk)</li>
                                <li>Departure and arrival cities or airport codes (e.g., KUL to REP)</li>
                                <li>Number of nights in hotels</li>
                            </ul>
                        </div>
                        <div className="space-y-2">
                             <label htmlFor="destinationCountryCode" className="font-medium text-sm">Primary Destination Country</label>
                            <Select onValueChange={setDestinationCountryCode} value={destinationCountryCode}>
                                <SelectTrigger id="destinationCountryCode"><SelectValue placeholder="Select a country..." /></SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Textarea
                            placeholder="e.g., Day 1: Taxi from Kuala Lumpur to KLIA, 2-hour flight to Siem Reap, then a bus to the city center. Stayed 3 nights in a hotel..."
                            value={travelDescription}
                            onChange={(e) => setTravelDescription(e.target.value)}
                            rows={8}
                            className="text-base"
                        />
                        <div className="flex items-center justify-end gap-4">
                            <Badge variant="secondary" className="text-base">
                                <Coins className="h-4 w-4 mr-1.5 text-amber-500" />
                                Cost: {settings?.ecoFootprintCost || 10} Tokens
                            </Badge>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? <LoaderCircle className="animate-spin mr-2" /> : <Bot className="mr-2" />}
                                Calculate My Footprint
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
            
            {(isLoading || result || debugLog.length > 0) && (
                 <Card className="mt-6 animate-in fade-in-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           {isLoading ? <LoaderCircle className="text-primary animate-spin" /> : <Leaf className="text-green-600"/>}
                           Calculation Result
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {isLoading && !result && <p className="text-center text-muted-foreground">AI agent is working...</p>}
                        {result && (
                            <>
                                <div className="text-center p-6 bg-muted rounded-lg">
                                    <p className="text-lg text-muted-foreground">Total Footprint</p>
                                    <p className="text-6xl font-bold text-primary">{result.totalFootprintKgCo2.toFixed(1)}</p>
                                    <p className="text-muted-foreground">kg CO₂</p>
                                </div>
        
                                <div>
                                    <h3 className="font-semibold mb-2">Breakdown:</h3>
                                    <div className="space-y-2">
                                        {result.breakdown.map((item, index) => (
                                            <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md text-sm">
                                                <span>{item.item}</span>
                                                <span className="font-semibold">{item.footprint.toFixed(1)} kg CO₂</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
        
                                <Separator />
        
                                <div>
                                    <h3 className="font-semibold mb-2">How to Offset:</h3>
                                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center space-y-2">
                                        <p className="text-lg font-medium text-green-800">{result.offsetSuggestion}</p>
                                        {result.localOpportunities.length > 0 && (
                                            <>
                                                <p className="text-sm text-green-700">Here are some local opportunities the AI found:</p>
                                                <div className="space-y-1 text-left">
                                                    {result.localOpportunities.map(opp => (
                                                         <a href={opp.url} target="_blank" rel="noopener noreferrer" key={opp.url} className="block p-3 rounded-md hover:bg-green-500/20">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2 bg-background rounded-md">{activityTypeIcons[opp.activityType]}</div>
                                                                <div className="flex-1">
                                                                     <p className="font-semibold text-sm flex items-center gap-1">{opp.name} <ExternalLink className="h-3 w-3" /></p>
                                                                     <p className="text-xs text-muted-foreground italic truncate">"{opp.description}"</p>
                                                                </div>
                                                            </div>
                                                         </a>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
        
                                <Separator />
                                
                                <div>
                                     <h3 className="font-semibold mb-2">Methodology & Assumptions:</h3>
                                     <p className="text-xs text-muted-foreground p-3 bg-background rounded-md whitespace-pre-wrap">{result.methodology}</p>
                                </div>
                                 <div>
                                     <h3 className="font-semibold mb-2">References:</h3>
                                     <ul className="list-disc pl-5 text-xs text-primary space-y-1">
                                        {result.references.map(ref => (
                                            <li key={ref}><a href={ref} target="_blank" rel="noopener noreferrer" className="hover:underline">{ref}</a></li>
                                        ))}
                                     </ul>
                                </div>
                            </>
                        )}

                        {debugLog.length > 0 && (
                             <Accordion type="single" collapsible>
                                <AccordionItem value="debug-log">
                                    <AccordionTrigger>
                                        <h3 className="font-semibold text-sm flex items-center gap-2"><Info className="h-4 w-4"/> Debug Log</h3>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <pre className="text-xs p-4 bg-gray-900 text-white rounded-md max-h-60 overflow-auto">
                                            {debugLog.join('\n')}
                                        </pre>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        )}
                    </CardContent>
                 </Card>
            )}
        </div>
    )
}

function EcoIntelContent() {
    const [selectedCountry, setSelectedCountry] = useState<{code: string; name: string} | null>(null);
    const countryOptions = useMemo(() => lightweightCountries.map(c => ({ code: c.code, name: c.name })), []);

    return (
        <div className="space-y-8">
            <MainHeader title="Eco-Intel Hub" description="Calculate your carbon footprint and discover eco-friendly travel options." />
             <Tabs defaultValue="calculator" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="calculator"><FlaskConical className="mr-2"/> Carbon Calculator</TabsTrigger>
                    <TabsTrigger value="eco-tourism"><Globe className="mr-2"/> Eco-Tourism</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="mt-6">
                    <EcoFootprintCalculator />
                </TabsContent>
                <TabsContent value="eco-tourism" className="mt-6">
                     <Card>
                        <CardHeader>
                            <CardTitle>Discover Eco-Tourism</CardTitle>
                            <CardDescription>Select a country to find responsible tourism opportunities curated from our database.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Select onValueChange={(value) => setSelectedCountry(countryOptions.find(c => c.code === value) || null)}>
                                <SelectTrigger className="max-w-sm">
                                    <SelectValue placeholder="Select a country..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-72">
                                        {countryOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>
                    {selectedCountry && <EcoTourismTab countryCode={selectedCountry.code} countryName={selectedCountry.name} />}
                </TabsContent>
            </Tabs>
        </div>
    )
}


export default function EcoFootprintPage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login?redirect=/eco-footprint');
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
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EcoIntelContent />
        </Suspense>
    )
}
