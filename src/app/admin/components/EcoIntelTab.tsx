

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, Save, Bot, CheckCircle2, AlertTriangle, Database, Search, Leaf, TreePine, Recycle, Anchor, PlusCircle, ExternalLink, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';
import { discoverEcoIntel } from '@/ai/flows/discover-eco-intel-flow';
import type { CountryEcoIntel } from '@/lib/types';
import { lightweightCountries, type LightweightCountry } from '@/lib/location-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getEcoIntelAdmin, updateEcoIntelAdmin, saveEcoIntelData, buildEcoIntelData } from '@/actions/eco-intel-admin';


const activityTypeIcons: Record<string, React.ReactNode> = {
    tree_planting: <TreePine className="h-4 w-4" />,
    coral_planting: <Anchor className="h-4 w-4" />,
    recycling: <Recycle className="h-4 w-4" />,
    conservation: <Leaf className="h-4 w-4" />,
    other: <PlusCircle className="h-4 w-4" />,
};

interface BuildResult {
    countryCode: string;
    countryName: string;
    status: 'pending' | 'generating' | 'success' | 'failed';
    error?: string;
    log: string[];
}

export default function EcoIntelTab() {
    const { toast } = useToast();
    
    const [intelData, setIntelData] = useState<CountryEcoIntel[]>([]);
    const [isDbLoading, setIsDbLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState<CountryEcoIntel[]>([]);
    const [editState, setEditState] = useState<Record<string, Partial<CountryEcoIntel>>>({});
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
    const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    
    const [buildResults, setBuildResults] = useState<BuildResult[]>([]);
    const [isBuilding, setIsBuilding] = useState(false);

    const fetchIntelData = useCallback(async () => {
        setIsDbLoading(true);
        try {
            const data = await getEcoIntelAdmin();
            setIntelData(data);
            setFilteredData(data);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch country eco-intel data.' });
        } finally {
            setIsDbLoading(false);
        }
    }, [toast]);
    
    const handleSearch = (e?: React.FormEvent) => {
        e?.preventDefault();
        setHasSearched(true);
        const lowercasedTerm = searchTerm.toLowerCase();
        if (!lowercasedTerm) {
            setFilteredData(intelData);
        } else {
            setFilteredData(
                intelData.filter(country =>
                    country.countryName.toLowerCase().includes(lowercasedTerm) ||
                    (country.region && country.region.toLowerCase().includes(lowercasedTerm)) ||
                    country.id.toLowerCase().includes(lowercasedTerm)
                )
            );
        }
    };

    useEffect(() => {
        fetchIntelData();
    }, [fetchIntelData]);
    
    const countriesByRegion = useMemo(() => {
        const regions: Record<string, LightweightCountry[]> = {};
        lightweightCountries.forEach(country => {
            const region = country.region || 'Uncategorized';
            if (!regions[region]) {
                regions[region] = [];
            }
            regions[region].push(country);
        });
        
        const sortedRegions: Record<string, LightweightCountry[]> = {};
        Object.keys(regions).sort().forEach(key => {
            regions[key].sort((a, b) => a.name.localeCompare(b.name));
            sortedRegions[key] = regions[key];
        });
        return sortedRegions;
    }, []);

    const builtCountryData = useMemo(() => {
        return new Map(intelData.map(c => [c.id, c]));
    }, [intelData]);

    const handleBuildDatabase = async () => {
        if (selectedCountries.length === 0) {
            toast({ variant: 'destructive', title: 'No Selection', description: 'Please select at least one country or region to build.' });
            return;
        }

        setIsBuilding(true);
        const initialResults: BuildResult[] = selectedCountries.map(code => {
            const country = lightweightCountries.find(c => c.code === code);
            return {
                countryCode: code,
                countryName: country?.name || 'Unknown',
                status: 'pending',
                log: [`[START] Queued for build: ${country?.name}`]
            };
        });
        setBuildResults(initialResults);

        const processSingleCountry = async (countryCode: string) => {
            const country = lightweightCountries.find(c => c.code === countryCode);
            if (!country) return;

            setBuildResults(prev => prev.map(r => 
                r.countryCode === countryCode ? { ...r, status: 'generating' } : r
            ));
            
            const result = await buildEcoIntelData(countryCode);

            setBuildResults(prev => prev.map(r => 
                r.countryCode === countryCode 
                    ? { ...r, log: result.log, status: result.success ? 'success' : 'failed', error: result.error } 
                    : r
            ));
        };
    
        const BATCH_SIZE = 5;
        for (let i = 0; i < selectedCountries.length; i += BATCH_SIZE) {
            const batch = selectedCountries.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(countryCode => processSingleCountry(countryCode)));
        }
    
        setIsBuilding(false);
        toast({ title: 'Database Build Complete', description: 'Review the logs for details on each country.' });
        await fetchIntelData();
    };

    const handleCellChange = (countryCode: string, field: keyof CountryEcoIntel, value: any, oppIndex?: number) => {
        setEditState(prev => {
            const newCountryState = { ...(prev[countryCode] || intelData.find(c => c.id === countryCode)) };

            if (field === 'offsettingOpportunities' && oppIndex !== undefined) {
                const newOpps = [...(newCountryState.offsettingOpportunities || [])];
                newOpps[oppIndex] = { ...newOpps[oppIndex], ...value };
                newCountryState.offsettingOpportunities = newOpps;
            } else if (field === 'curatedSearchSources') {
                newCountryState.curatedSearchSources = value.split('\n');
            } else {
                 (newCountryState as any)[field] = value;
            }

            return { ...prev, [countryCode]: newCountryState };
        });
    };

    const handleSave = async (countryCode: string) => {
        const changes = editState[countryCode];
        if (!changes) return;

        setIsSaving(prev => ({ ...prev, [countryCode]: true }));
        try {
            const result = await updateEcoIntelAdmin(countryCode, changes);
            if(result.success) {
                toast({ title: 'Success', description: 'Eco-intel data updated.' });
                await fetchIntelData(); // Refetch to get the fresh data state
                setEditState(prev => {
                    const newState = { ...prev };
                    delete newState[countryCode];
                    return newState;
                });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to save changes.' });
        } finally {
            setIsSaving(prev => ({ ...prev, [countryCode]: false }));
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start mb-4">
                    <div>
                       <CardTitle>Eco-Intel Database</CardTitle>
                       <CardDescription>Manage curated environmental data for the Eco-Footprint calculator. Carbon calculation sources are managed globally in App Settings.</CardDescription>
                    </div>
                    <Dialog open={isBuildDialogOpen} onOpenChange={setIsBuildDialogOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isBuilding}>
                                {isBuilding ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Bot className="mr-2 h-4 w-4" />}
                                Build/Update Database
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                            <DialogHeader>
                                <DialogTitle>Build Eco-Intel Database</DialogTitle>
                                <DialogDescription>
                                    Select regions or countries to research. The AI will find local offsetting opportunities. Re-selecting a country will overwrite its existing data.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ScrollArea className="h-[60vh] border rounded-lg p-2">
                                    <div className="space-y-4 p-1">
                                        {Object.entries(countriesByRegion).map(([region, countries]) => (
                                            <Accordion key={region} type="single" collapsible>
                                                <AccordionItem value={region} className="border rounded-md px-2">
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            id={`region-checkbox-${region}`}
                                                            className="ml-2"
                                                            checked={countries.every(c => selectedCountries.includes(c.code))}
                                                            onCheckedChange={(checked) => {
                                                                const regionCodes = countries.map(c => c.code);
                                                                if(checked) {
                                                                    setSelectedCountries(prev => [...new Set([...prev, ...regionCodes])]);
                                                                } else {
                                                                    setSelectedCountries(prev => prev.filter(c => !regionCodes.includes(c)));
                                                                }
                                                            }}
                                                        />
                                                        <AccordionTrigger className="hover:no-underline">
                                                            <Label htmlFor={`region-checkbox-${region}`} className="font-semibold cursor-pointer w-full text-left">
                                                                {region} ({countries.length})
                                                            </Label>
                                                        </AccordionTrigger>
                                                    </div>
                                                    <AccordionContent>
                                                        <div className="grid grid-cols-2 gap-2 p-4">
                                                            {countries.map(country => (
                                                                <div key={country.code} className="flex items-center space-x-2">
                                                                    <Checkbox 
                                                                        id={country.code} 
                                                                        checked={selectedCountries.includes(country.code)}
                                                                        onCheckedChange={(checked) => {
                                                                            setSelectedCountries(prev => checked ? [...prev, country.code] : prev.filter(c => c !== country.code));
                                                                        }}
                                                                    />
                                                                    <Label htmlFor={country.code} className="flex items-center gap-1.5 cursor-pointer">
                                                                        {country.name}
                                                                    </Label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        ))}
                                    </div>
                                </ScrollArea>
                                <ScrollArea className="h-[60vh] border rounded-lg p-2 bg-muted/30">
                                    <div className="p-2 space-y-2">
                                        {buildResults.length === 0 && !isBuilding && <p className="text-center text-sm text-muted-foreground p-4">Logs will appear here once the build process starts.</p>}
                                        {buildResults.map((result) => (
                                            <Accordion key={result.countryCode} type="single" collapsible className="w-full">
                                                <AccordionItem value="log">
                                                    <AccordionTrigger className="p-2 text-sm font-semibold rounded-md hover:bg-muted">
                                                        <div className="flex items-center gap-2">
                                                             {result.status === 'pending' ? <Clock className="h-4 w-4 text-muted-foreground" />
                                                                : result.status === 'generating' ? <LoaderCircle className="h-4 w-4 text-primary animate-spin" />
                                                                : result.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                                : <AlertTriangle className="h-4 w-4 text-destructive" />
                                                            }
                                                            {result.countryName}
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="mt-1">
                                                        <pre className="text-xs p-2 bg-background rounded-md max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                                                            {result.log.join('\n')}
                                                            {result.error && `[FINAL ERROR] ${result.error}`}
                                                        </pre>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => { setIsBuildDialogOpen(false); setBuildResults([]); setSelectedCountries([]); }}>Close</Button>
                                <Button onClick={handleBuildDatabase} disabled={isBuilding || selectedCountries.length === 0}>
                                    {isBuilding ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Build for {selectedCountries.length} Countries
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <form className="flex items-center gap-2" onSubmit={handleSearch}>
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Search by country name, code, or region..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button type="submit">Search</Button>
                </form>
            </CardHeader>
            <CardContent>
                 <ScrollArea className="h-[60vh] mt-4">
                    <Accordion type="multiple" className="w-full">
                    {isDbLoading ? (
                        <div className="flex justify-center items-center h-24">
                            <LoaderCircle className="h-6 w-6 animate-spin text-primary mx-auto" />
                        </div>
                    ) : filteredData.length > 0 ? (
                        filteredData.map((country, countryIndex) => {
                            const countryEdits = editState[country.id] || {};
                            const currentData = { ...country, ...countryEdits };
                            const hasChanges = Object.keys(countryEdits).length > 0;
                            const isRowSaving = isSaving[country.id];
                            return (
                                <AccordionItem value={country.id} key={country.id} className="border-b">
                                    <AccordionTrigger className="hover:no-underline p-4">
                                        <div className="flex-1 grid grid-cols-2 items-center text-left">
                                            <span className="font-medium">{country.countryName} ({country.id})</span>
                                            <span className="text-muted-foreground">{country.region}</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="px-4 pb-4 space-y-6">
                                            <div>
                                                <Label htmlFor={`curated-sources-${country.id}`} className="font-semibold mb-2 block">Curated Search Sources</Label>
                                                <Textarea 
                                                    id={`curated-sources-${country.id}`}
                                                    value={(currentData.curatedSearchSources || []).join('\n')} 
                                                    onChange={(e) => handleCellChange(country.id, 'curatedSearchSources', e.target.value)} 
                                                    placeholder="One URL per line (e.g., wwf.org.my)"
                                                    rows={4}
                                                    className="text-xs"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">Add trusted NGOs, government agencies, etc. to prioritize them in the AI search.</p>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-2">Offsetting Opportunities</h4>
                                                <div className="space-y-4">
                                                    {(currentData.offsettingOpportunities || []).map((opp, oppIndex) => (
                                                        <div key={oppIndex} className="p-3 border rounded-lg space-y-2">
                                                            <Input value={opp.name} onChange={(e) => handleCellChange(country.id, 'offsettingOpportunities', { name: e.target.value }, oppIndex)} placeholder="Organization Name" />
                                                             <div className="flex items-center gap-2">
                                                                <Input value={opp.url} onChange={(e) => handleCellChange(country.id, 'offsettingOpportunities', { url: e.target.value }, oppIndex)} placeholder="https://example.com" />
                                                                <a href={opp.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                                                    <ExternalLink className="h-4 w-4" />
                                                                </a>
                                                            </div>
                                                            <Textarea value={opp.description} onChange={(e) => handleCellChange(country.id, 'offsettingOpportunities', { description: e.target.value }, oppIndex)} placeholder="One-sentence description..." rows={2} className="text-xs" />
                                                            <Select value={opp.activityType} onValueChange={(value) => handleCellChange(country.id, 'offsettingOpportunities', { activityType: value }, oppIndex)}>
                                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="tree_planting">Tree Planting</SelectItem>
                                                                    <SelectItem value="coral_planting">Coral Planting</SelectItem>
                                                                    <SelectItem value="recycling">Recycling</SelectItem>
                                                                    <SelectItem value="conservation">Conservation</SelectItem>
                                                                    <SelectItem value="other">Other</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex justify-end">
                                                 <Button size="sm" onClick={() => handleSave(country.id)} disabled={!hasChanges || isRowSaving}>
                                                    {isRowSaving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                                    Save Changes
                                                </Button>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })
                    ) : (
                        <div className="text-center text-muted-foreground py-10">
                            {hasSearched ? 'No results for your search.' : 'No country eco-intel data found. Try building the database.'}
                        </div>
                    )}
                    </Accordion>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
