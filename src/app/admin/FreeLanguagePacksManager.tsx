
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { languages, type LanguageCode } from '@/lib/data';
import { getFreeLanguagePacks, setFreeLanguagePacks } from '@/actions/audiopack-admin';
import { LoaderCircle, Check, Save } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FreeLanguagePacksManager() {
    const { toast } = useToast();
    const [freePacks, setFreePacks] = useState<LanguageCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const fetchFreePacks = useCallback(async () => {
        setIsLoading(true);
        try {
            const packs = await getFreeLanguagePacks();
            setFreePacks(packs);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch the list of free packs.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchFreePacks();
    }, [fetchFreePacks]);

    const handleCheckboxChange = (langCode: LanguageCode, checked: boolean) => {
        setFreePacks(prev => {
            const newPacks = new Set(prev);
            if (checked) {
                newPacks.add(langCode);
            } else {
                newPacks.delete(langCode);
            }
            return Array.from(newPacks);
        });
        setHasChanges(true);
    };
    
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setFreePacks(languages.map(l => l.value));
        } else {
            setFreePacks([]);
        }
        setHasChanges(true);
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const result = await setFreeLanguagePacks(freePacks);
        if (result.success) {
            toast({ title: 'Success!', description: 'The list of free language packs has been updated.' });
            setHasChanges(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to save changes.' });
        }
        setIsSaving(false);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-8">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <CardDescription>
                Select which language packs users can download for free. Unchecked packs will cost tokens to download, based on the cost set in App Settings.
            </CardDescription>

            <div className="space-y-2">
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="select-all-free"
                        onCheckedChange={handleSelectAll}
                        checked={freePacks.length === languages.length}
                    />
                    <Label htmlFor="select-all-free" className="font-bold">
                        Select All (Make all packs free)
                    </Label>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                {languages.map(lang => (
                    <div key={lang.value} className="flex items-center space-x-2">
                        <Checkbox
                            id={`free-${lang.value}`}
                            onCheckedChange={(checked) => handleCheckboxChange(lang.value, !!checked)}
                            checked={freePacks.includes(lang.value)}
                        />
                        <Label htmlFor={`free-${lang.value}`} className="font-medium cursor-pointer">{lang.label}</Label>
                    </div>
                ))}
            </div>
            
            <div className="flex justify-end pt-4">
                <Button onClick={handleSaveChanges} disabled={isSaving || !hasChanges}>
                    {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
