
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { languages, type LanguageCode } from '@/lib/data';
import { getFreeLanguagePacks, setFreeLanguagePacks, getGenerationMetadata, LanguagePackGenerationMetadata, applyFreeLanguagesToAllUsers } from '@/actions/audiopack-admin';
import { LoaderCircle, Check, Save, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


export default function FreeLanguagePacksManager() {
    const { toast } = useToast();
    const [freePacks, setFreePacks] = useState<LanguageCode[]>([]);
    const [availablePacks, setAvailablePacks] = useState<{value: LanguageCode, label: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const fetchInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [packs, metadata] = await Promise.all([
                getFreeLanguagePacks(),
                getGenerationMetadata()
            ]);
            
            const completePacks = metadata
                .filter(meta => meta.generatedCount === meta.totalCount && meta.totalCount > 0)
                .map(meta => {
                    const langInfo = languages.find(l => l.value === meta.id);
                    return { value: meta.id, label: langInfo?.label || meta.name };
                });

            setAvailablePacks(completePacks);
            setFreePacks(packs);

        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch required data.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

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
            setFreePacks(availablePacks.map(l => l.value));
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
    
     const handleApplyToAll = async () => {
        setIsApplying(true);
        const result = await applyFreeLanguagesToAllUsers();
        if (result.success) {
            toast({ title: 'Success!', description: 'The current free languages have been applied to all existing users.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to apply changes to all users.' });
        }
        setIsApplying(false);
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
                Select which language packs users can download for free. Only successfully generated packs are shown here. Unchecked packs will cost tokens to download, based on the cost set in App Settings.
            </CardDescription>

            {availablePacks.length > 0 ? (
                <>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="select-all-free"
                                onCheckedChange={handleSelectAll}
                                checked={availablePacks.length > 0 && freePacks.length === availablePacks.length}
                            />
                            <Label htmlFor="select-all-free" className="font-bold">
                                Select All (Make all packs free)
                            </Label>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                        {availablePacks.map(lang => (
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
                </>
            ) : (
                <div className="text-center py-8 text-muted-foreground">
                    <p>No complete language packs have been generated yet.</p>
                    <p className="text-xs">Go to the 'Generate' tab to build them.</p>
                </div>
            )}
            
            <div className="flex justify-end pt-4 gap-2">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="secondary" disabled={isApplying || hasChanges}>
                            <Users className="mr-2 h-4 w-4" />
                            Apply to All Users
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Apply to all existing users?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will grant all current users access to the currently selected free languages ({freePacks.length} languages). This action cannot be undone. New users will get this list automatically.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleApplyToAll} disabled={isApplying}>
                                {isApplying ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Confirm & Apply
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <Button onClick={handleSaveChanges} disabled={isSaving || !hasChanges}>
                    {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
