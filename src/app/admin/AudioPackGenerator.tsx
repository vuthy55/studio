
"use client";

import React, { useState } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { generateLanguagePack } from '@/actions/audiopack-admin';
import { LoaderCircle, CheckCircle2, AlertTriangle, Music } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type GenerationStatus = 'idle' | 'generating' | 'success' | 'failed';

interface LanguageStatus {
  code: LanguageCode;
  status: GenerationStatus;
  message?: string;
}

export default function AudioPackGenerator() {
  const [selectedLanguages, setSelectedLanguages] = useState<LanguageCode[]>([]);
  const [statuses, setStatuses] = useState<Record<LanguageCode, LanguageStatus>>(() => {
    const initial: Record<string, LanguageStatus> = {};
    languages.forEach(lang => {
      initial[lang.value] = { code: lang.value, status: 'idle' };
    });
    return initial;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

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
                message: result.message
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
        <CardTitle className="flex items-center gap-2"><Music /> Offline Audio Pack Generator</CardTitle>
        <CardDescription>
          Select languages to pre-generate their complete audio packs. These packs are stored in Firebase Storage for users to download for offline use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
            {languages.map(lang => (
              <div key={lang.value} className="flex items-start space-x-2">
                <Checkbox
                  id={lang.value}
                  onCheckedChange={(checked) => handleCheckboxChange(lang.value, checked)}
                  checked={selectedLanguages.includes(lang.value)}
                  disabled={isGenerating}
                />
                <div className="grid gap-1.5 leading-none">
                    <Label htmlFor={lang.value} className="font-medium cursor-pointer">{lang.label}</Label>
                    <div className="flex items-center gap-1.5">
                        {renderStatusIcon(statuses[lang.value].status)}
                        <p className="text-xs text-muted-foreground">{statuses[lang.value].message}</p>
                    </div>
                </div>
              </div>
            ))}
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
      </CardContent>
    </Card>
  );
}
