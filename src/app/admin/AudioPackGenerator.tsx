
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { generateLanguagePack, getGenerationMetadata, type LanguagePackGenerationMetadata } from '@/actions/audiopack-admin';
import { LoaderCircle, CheckCircle2, AlertTriangle, Music, RefreshCw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';


type GenerationStatus = 'idle' | 'generating' | 'success' | 'failed';

interface LanguageStatus {
  code: LanguageCode;
  status: GenerationStatus;
  message?: string;
  generatedCount?: number;
  totalCount?: number;
}

export default function AudioPackGenerator() {
  const [selectedLanguages, setSelectedLanguages] = useState<LanguageCode[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LanguageStatus>>(() => {
    const initial: Record<string, LanguageStatus> = {};
    languages.forEach(lang => {
      initial[lang.value] = { code: lang.value, status: 'idle' };
    });
    return initial;
  });
  const [metadata, setMetadata] = useState<Record<string, LanguagePackGenerationMetadata>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const { toast } = useToast();
  
  const handleFetchMetadata = useCallback(async () => {
    setIsFetchingStatus(true);
    try {
        const metaDataArray = await getGenerationMetadata();
        const metaObject = metaDataArray.reduce((acc, meta) => {
            acc[meta.id] = meta;
            return acc;
        }, {} as Record<string, LanguagePackGenerationMetadata>);
        setMetadata(metaObject);
        if (!hasFetchedOnce) {
            setHasFetchedOnce(true);
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch generation history.' });
    } finally {
        setIsFetchingStatus(false);
    }
  }, [toast, hasFetchedOnce]);

  const handleCheckboxChange = (langCode: LanguageCode, checked: boolean | 'indeterminate') => {
    if (checked) {
      setSelectedLanguages(prev => [...prev, langCode]);
    } else {
      setSelectedLanguages(prev => prev.filter(code => code !== langCode));
    }
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
        setSelectedLanguages(languages.map(l => l.value));
    } else {
        setSelectedLanguages([]);
    }
  };

  const handleGenerate = async () => {
    if (selectedLanguages.length === 0) {
      toast({ variant: 'destructive', title: 'No Languages Selected', description: 'Please select at least one language to generate.' });
      return;
    }

    setIsGenerating(true);
    
    // Reset statuses for selected languages
    setStatuses(prev => {
        const newStatuses = { ...prev };
        selectedLanguages.forEach(langCode => {
            newStatuses[langCode] = { ...newStatuses[langCode], status: 'generating', message: 'Starting...' };
        });
        return newStatuses;
    });

    const results = await generateLanguagePack(selectedLanguages);

    // Update statuses based on results
    setStatuses(prev => {
        const newStatuses = { ...prev };
        results.forEach(result => {
            newStatuses[result.language] = {
                code: result.language,
                status: result.success ? 'success' : 'failed',
                message: result.message,
                generatedCount: result.generatedCount,
                totalCount: result.totalCount,
            };
        });
        return newStatuses;
    });
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    if (failureCount > 0) {
         toast({ variant: 'destructive', title: 'Generation Finished with Errors', description: `${failureCount} language pack(s) failed to generate. Check details below.` });
    } else {
         toast({ title: 'Generation Complete!', description: `Successfully generated ${successCount} language pack(s).` });
    }
    
    await handleFetchMetadata(); // Refresh metadata after generation
    setIsGenerating(false);
  };

  const renderStatusIcon = (status: GenerationStatus) => {
    switch (status) {
        case 'generating':
            return <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />;
        case 'success':
            return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'failed':
            return <AlertTriangle className="h-4 w-4 text-destructive" />;
        default:
            return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle className="flex items-center gap-2"><Music /> Language Pack Generator</CardTitle>
                <CardDescription>
                Select languages to pre-generate their complete audio packs. This provides a generation status for previously built packs.
                </CardDescription>
            </div>
             <Button onClick={handleFetchMetadata} variant="outline" size="sm" disabled={isFetchingStatus || isGenerating}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetchingStatus ? 'animate-spin' : ''}`} />
                {hasFetchedOnce ? 'Refresh Status' : 'Load Pack Status'}
            </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasFetchedOnce ? (
            <div className="flex justify-center items-center py-8 text-muted-foreground">
                <p>Click 'Load Pack Status' to view the generation history.</p>
            </div>
        ) : isFetchingStatus ? (
             <div className="flex justify-center items-center py-8">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading...</span>
            </div>
        ) : (
            <>
            <div className="space-y-2">
            <div className="flex items-center space-x-2">
                <Checkbox
                id="select-all"
                onCheckedChange={handleSelectAll}
                checked={selectedLanguages.length === languages.length}
                disabled={isGenerating}
                />
                <Label htmlFor="select-all" className="font-bold">
                Select All Languages
                </Label>
            </div>
            <Separator />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                    {languages.map(lang => {
                    const langStatus = statuses[lang.value];
                    const meta = metadata[lang.value];
                    const isComplete = meta && meta.generatedCount === meta.totalCount;

                    return (
                    <div key={lang.value} className="flex items-start space-x-2">
                        <Checkbox
                        id={lang.value}
                        onCheckedChange={(checked) => handleCheckboxChange(lang.value, checked)}
                        checked={selectedLanguages.includes(lang.value)}
                        disabled={isGenerating}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor={lang.value} className="font-medium cursor-pointer">{lang.label}</Label>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {renderStatusIcon(langStatus.status)}
                                <span>{langStatus.message}</span>
                            </div>
                            {meta && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                        <Badge variant={isComplete ? 'default' : 'destructive'} className="cursor-help w-fit">
                                            {isComplete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                            {meta.generatedCount}/{meta.totalCount}
                                        </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Last generated: {formatDistanceToNow(new Date(meta.lastGeneratedAt), { addSuffix: true })}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                    </div>
                    )})}
                </div>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || selectedLanguages.length === 0}>
            {isGenerating ? (
                <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Generating...
                </>
            ) : (
                `Generate Selected Packs (${selectedLanguages.length})`
            )}
            </Button>
            </>
        )}
      </CardContent>
    </Card>
  );
}
