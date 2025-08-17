
"use client";

import React, { Suspense, useEffect, useState } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, FlaskConical, Leaf, Bot, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { calculateEcoFootprintAction } from '@/actions/eco-intel';
import type { EcoFootprintOutput } from '@/ai/flows/types';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

function EcoFootprintCalculator() {
    const { user, settings } = useUserData();
    const { toast } = useToast();
    const [travelDescription, setTravelDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<EcoFootprintOutput | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!travelDescription.trim() || !user) {
            toast({ variant: 'destructive', title: 'Input Required', description: 'Please describe your journey.' });
            return;
        }

        setIsLoading(true);
        setResult(null);

        try {
            const calculationResult = await calculateEcoFootprintAction({ travelDescription }, user.uid);
            setResult(calculationResult);
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
                    <CardTitle>Eco-Footprint Calculator (Test)</CardTitle>
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
                        <Textarea
                            placeholder="e.g., Day 1: Taxi from Kuala Lumpur to KLIA, 2-hour flight to Siem Reap, then a bus to the city center. Stayed 2 nights in a hotel..."
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
            
            {result && (
                <Card className="mt-6 animate-in fade-in-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Leaf className="text-green-600"/> Your Trip's Estimated Footprint</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
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
                                                 <a href={opp.url} target="_blank" rel="noopener noreferrer" key={opp.url} className="block p-2 rounded-md hover:bg-green-500/20">
                                                    <p className="font-semibold text-sm flex items-center gap-1">{opp.name} <ExternalLink className="h-3 w-3" /></p>
                                                    <p className="text-xs text-muted-foreground italic truncate">"{opp.snippet}"</p>
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
                    </CardContent>
                </Card>
            )}
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
        <div className="space-y-8">
            <MainHeader title="Eco-Footprint Calculator" description="Understand the environmental impact of your travels." />
             <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                <EcoFootprintCalculator />
            </Suspense>
        </div>
    )
}
