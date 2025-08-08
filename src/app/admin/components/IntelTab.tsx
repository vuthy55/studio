

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, Save, Link as LinkIcon, Bot, CheckCircle2, AlertTriangle, Database, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getAppSettingsAction, updateAppSettingsAction, type AppSettings } from '@/actions/settings';
import { getCountryIntelAdmin, updateCountryIntelAdmin, buildCountryIntelData } from '@/actions/intel-admin';
import type { CountryIntelData } from '@/lib/types';
import { lightweightCountries, type LightweightCountry } from '@/lib/location-data';

type BuildStatus = 'idle' | 'generating' | 'success' | 'failed';

interface CountryBuildStatus {
    countryCode: string;
    countryName: string;
    status: BuildStatus;
    error?: string;
}

export default function IntelTab() {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('database');

    // State for AI Sources tab
    const [settings, setSettings] = useState<Partial<AppSettings>>({});
    const [isSettingsLoading, setIsSettingsLoading] = useState(true);
    const [isSettingsSaving, setIsSettingsSaving] = useState(false);
    
    // State for Database tab
    const [intelData, setIntelData] = useState<CountryIntelData[]>([]);
    const [isDbLoading, setIsDbLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState<CountryIntelData[]>([]);
    const [editState, setEditState] = useState<Record<string, Partial<CountryIntelData>>>({});
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
    const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false);
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    
    // New state for build status tracking
    const [buildStatuses, setBuildStatuses] = useState<Record<string, CountryBuildStatus>>({});
    const [isBuilding, setIsBuilding] = useState(false);


    // AI Sources Logic
    useEffect(() => {
        if(activeTab === 'sources') {
            setIsSettingsLoading(true);
            getAppSettingsAction().then(data => {
                setSettings(data);
                setIsSettingsLoading(false);
            });
        }
    }, [activeTab]);

    const handleSettingsSave = async () => {
        setIsSettingsSaving(true);
        // This function should ONLY save the intel-related settings.
        const intelSettings = {
            infohubGovernmentAdvisorySources: settings.infohubGovernmentAdvisorySources,
            infohubGlobalNewsSources: settings.infohubGlobalNewsSources,
        };
        const result = await updateAppSettingsAction(intelSettings);
        if (result.success) {
            toast({ title: "Success", description: "AI sources have been updated." });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error || "Could not save settings." });
        }
        setIsSettingsSaving(false);
    };

    const handleSettingsInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setSettings(prev => ({...prev, [id]: value }));
    };
    
    const renderTextarea = (key: string, label: string, description: string) => (
        <div className="space-y-2" key={key}>
            <Label htmlFor={key} className="flex items-center gap-1.5"><LinkIcon/> {label}</Label>
            <Textarea 
                id={key as keyof AppSettings}
                value={(settings as any)[key] ?? ''} 
                onChange={handleSettingsInputChange}
                rows={3}
            />
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );

    // Country Database Logic
    const fetchIntelData = useCallback(async () => {
        setIsDbLoading(true);
        try {
            const data = await getCountryIntelAdmin();
            setIntelData(data);
            setFilteredData(data); // Initially show all data
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch country intel data.' });
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
        if (activeTab === 'database') {
            fetchIntelData();
        }
    }, [activeTab, fetchIntelData]);
    
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
            const result = await buildCountryIntelData(selectedCountries);
            
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
    
    const handleCellChange = (countryCode: string, field: keyof CountryIntelData, value: string) => {
        const valueAsArray = field === 'regionalNews' || field === 'localNews' || field === 'neighbours'
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
            const result = await updateCountryIntelAdmin(countryCode, changes);
            if(result.success) {
                toast({ title: 'Success', description: 'Country intel updated.' });
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
        <Card>
            <CardHeader>
                <CardTitle>Intel Management</CardTitle>
                <CardDescription>Configure AI data sources and manage the country intelligence database.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="sources">AI Sources</TabsTrigger>
                        <TabsTrigger value="database">Country Database</TabsTrigger>
                    </TabsList>
                    <TabsContent value="sources" className="mt-4">
                        {isSettingsLoading ? (
                             <div className="flex justify-center items-center py-10">
                                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ): (
                            <div className="space-y-6 pt-4">
                                {renderTextarea('infohubGovernmentAdvisorySources', 'Government Advisory Sources', 'Comma-separated list of official government travel advisory sites.')}
                                {renderTextarea('infohubGlobalNewsSources', 'Global News Sources', 'Comma-separated list of major global news outlets.')}
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSettingsSave} disabled={isSettingsSaving}>
                                        {isSettingsSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Sources
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="database" className="mt-4">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                               <p className="text-sm text-muted-foreground">This is the central database of curated news sources for the Intel feature.</p>
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
                                        <DialogTitle>Build Country Intel Database</DialogTitle>
                                        <DialogDescription>
                                            Select regions or countries to research. Re-selecting a country will overwrite its existing data with fresh information.
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
                                                    <span className="text-muted-foreground truncate">{country.neighbours?.join(', ')}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="px-4 pb-4 space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`regional-${country.id}`}>Regional News</Label>
                                                            <Textarea
                                                                id={`regional-${country.id}`}
                                                                value={(countryEdits.regionalNews ?? country.regionalNews)?.join(', ') ?? ''}
                                                                onChange={(e) => handleCellChange(country.id, 'regionalNews', e.target.value)}
                                                                className="text-xs min-h-[80px]"
                                                                placeholder="Comma-separated URLs"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                             <Label htmlFor={`local-${country.id}`}>Local News</Label>
                                                             <Textarea
                                                                id={`local-${country.id}`}
                                                                value={(countryEdits.localNews ?? country.localNews)?.join(', ') ?? ''}
                                                                onChange={(e) => handleCellChange(country.id, 'localNews', e.target.value)}
                                                                className="text-xs min-h-[80px]"
                                                                placeholder="Comma-separated URLs"
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
                                    {hasSearched ? 'No results for your search.' : 'No country data found. Try building the database.'}
                                </div>
                            )}
                            </Accordion>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

    