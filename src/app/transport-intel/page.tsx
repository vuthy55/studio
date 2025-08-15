
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, Save, Bot, CheckCircle2, AlertTriangle, Database, Search, Train, Plane, Bus, Car } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getTransportDataAdmin, updateTransportDataAdmin, buildTransportData } from '@/actions/transport-admin';
import type { CountryTransportData } from '@/lib/types';
import { lightweightCountries, type LightweightCountry } from '@/lib/location-data';
import Link from 'next/link';


type BuildStatus = 'idle' | 'generating' | 'success' | 'failed';

interface CountryBuildStatus {
    countryCode: string;
    countryName: string;
    status: BuildStatus;
    error?: string;
}

function TransportIntelPageContent() {
    const { toast } = useToast();
    
    // State for Database tab
    const [intelData, setIntelData] = useState<CountryTransportData[]>([]);
    const [isDbLoading, setIsDbLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState<CountryTransportData[]>([]);
    const [editState, setEditState] = useState<Record<string, Partial<CountryTransportData>>>({});
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
    const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    
    // New state for build status tracking
    const [buildStatuses, setBuildStatuses] = useState<Record<string, CountryBuildStatus>>({});
    const [isBuilding, setIsBuilding] = useState(false);


    // Country Database Logic
    const fetchIntelData = useCallback(async () => {
        setIsDbLoading(true);
        try {
            const data = await getTransportDataAdmin();
            setIntelData(data);
            setFilteredData(data); // Initially show all data
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch country transport data.' });
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
        if(selectedCountries.length === 0) {
            toast({ variant: 'destructive', title: 'No Selection', description: 'Please select at least one country or region to build.' });
            return;
        }
        
        setIsBuilding(true);
        const initialStatuses: Record<string, CountryBuildStatus> = {};
        selectedCountries.forEach(code => {
             const country = lightweightCountries.find(c => c.code === code);
             if (country) {
                initialStatuses[code] = { countryCode: code, countryName: country.name, status: 'generating' };
            }
        });
        setBuildStatuses(initialStatuses);
        
        try {
            const result = await buildTransportData(selectedCountries);
            
            if (result.success) {
                const finalStatuses: Record<string, CountryBuildStatus> = {};
                result.results.forEach(res => {
                    finalStatuses[res.countryCode] = { ...res, status: res.status === 'success' ? 'success' : 'failed' };
                });
                setBuildStatuses(prev => ({...prev, ...finalStatuses}));
                
                const successCount = result.results.filter(r => r.status === 'success').length;
                const failureCount = result.results.length - successCount;

                toast({ title: 'Database Build Finished', description: `Succeeded: ${successCount}, Failed: ${failureCount}.` });
                
                await fetchIntelData();
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: 'The build process failed to start.' });
                 setBuildStatuses({});
            }
        } catch(e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to start database build.' });
             setBuildStatuses({});
        }
        setIsBuilding(false);
    }
    
    const handleCellChange = (countryCode: string, field: keyof CountryTransportData, value: string) => {
        const valueAsArray = field === 'regionalTransportProviders' || field === 'localTransportProviders'
            ? value.split(',').map(s => s.trim()).filter(Boolean)
            : value;

        setEditState(prev => ({
            ...prev,
            [countryCode]: {
                ...prev[countryCode],
                [field]: valueAsArray,
            }
        }));
    };

    const handleSave = async (countryCode: string) => {
        const changes = editState[countryCode];
        if (!changes) return;

        setIsSaving(prev => ({ ...prev, [countryCode]: true }));
        try {
            const result = await updateTransportDataAdmin(countryCode, changes);
            if(result.success) {
                toast({ title: 'Success', description: 'Transport data updated.' });
                setIntelData(prevData => {
                    return prevData.map(d => 
                        d.id === countryCode ? { ...d, ...changes } : d
                    );
                });
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
        <div className="space-y-8">
            <MainHeader title="Transport Intel Hub" description="Manage the database of transportation providers for each country." />

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                           <CardTitle>Transport Provider Database</CardTitle>
                           <CardDescription>This is the central database of curated transport providers for the app.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button asChild variant="outline">
                                <Link href="/test-transport">
                                    <Plane className="mr-2 h-4 w-4" />
                                    Test Search
                                </Link>
                            </Button>
                            <Dialog open={isBuildDialogOpen} onOpenChange={setIsBuildDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button disabled={isBuilding}>
                                        {isBuilding ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Bot className="mr-2 h-4 w-4" />}
                                        Build/Update Database
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                    <DialogHeader>
                                        <DialogTitle>Build Transport Provider Database</DialogTitle>
                                        <DialogDescription>
                                            Select regions or countries to research. Re-selecting a country will overwrite its existing data with fresh information from the AI.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <ScrollArea className="h-[60vh]">
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
                                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                                                                {countries.map(country => {
                                                                    const buildStatus = buildStatuses[country.code];
                                                                    const dbStatus = builtCountryData.get(country.code)?.lastBuildStatus;

                                                                    return (
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
                                                                            {buildStatus ? (
                                                                                buildStatus.status === 'generating' ? <LoaderCircle className="h-3 w-3 text-primary animate-spin" />
                                                                                : buildStatus.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                                                : <AlertTriangle className="h-3 w-3 text-destructive" />
                                                                            ) : dbStatus ? (
                                                                                dbStatus === 'success' ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                                                : <AlertTriangle className="h-3 w-3 text-destructive" />
                                                                            ) : (
                                                                                 <Database className="h-3 w-3 text-muted-foreground" />
                                                                            )}
                                                                        </Label>
                                                                    </div>
                                                                )})}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                    <DialogFooter>
                                        <Button variant="ghost" onClick={() => { setIsBuildDialogOpen(false); setBuildStatuses({}); setSelectedCountries([]); }}>Close</Button>
                                        <Button onClick={handleBuildDatabase} disabled={isBuilding || selectedCountries.length === 0}>
                                            {isBuilding ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Build for {selectedCountries.length} Countries
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
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
                            filteredData.map(country => {
                                const countryEdits = editState[country.id] || {};
                                const hasChanges = Object.keys(countryEdits).length > 0;
                                const isRowSaving = isSaving[country.id];
                                return (
                                    <AccordionItem value={country.id} key={country.id} className="border-b">
                                        <AccordionTrigger className="hover:no-underline p-4">
                                            <div className="flex-1 grid grid-cols-3 items-center text-left">
                                                <span className="font-medium">{country.countryName} ({country.id})</span>
                                                <span className="text-muted-foreground">{country.region}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="px-4 pb-4 space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor={`regional-${country.id}`} className="flex items-center gap-2"><Plane/> Regional Providers</Label>
                                                        <Textarea
                                                            id={`regional-${country.id}`}
                                                            value={(countryEdits.regionalTransportProviders ?? country.regionalTransportProviders)?.join(', ') ?? ''}
                                                            onChange={(e) => handleCellChange(country.id, 'regionalTransportProviders', e.target.value)}
                                                            className="text-xs min-h-[80px]"
                                                            placeholder="Comma-separated URLs (e.g. airasia.com)"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                         <Label htmlFor={`local-${country.id}`} className="flex items-center gap-2"><Bus/> Local Providers</Label>
                                                         <Textarea
                                                            id={`local-${country.id}`}
                                                            value={(countryEdits.localTransportProviders ?? country.localTransportProviders)?.join(', ') ?? ''}
                                                            onChange={(e) => handleCellChange(country.id, 'localTransportProviders', e.target.value)}
                                                            className="text-xs min-h-[80px]"
                                                            placeholder="Comma-separated URLs (e.g. 12go.asia, ktmb.com.my)"
                                                        />
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
                                {hasSearched ? 'No results for your search.' : 'No country transport data found. Try building the database.'}
                            </div>
                        )}
                        </Accordion>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}


export default function TransportIntelPage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    return <TransportIntelPageContent />
}
