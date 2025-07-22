
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Mic, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';

type RecognitionStatus = 'idle' | 'listening' | 'processing';

export default function TestAutoDetectPage() {
  const { toast } = useToast();
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH', 'es-MX']);
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [result, setResult] = useState<{ detectedLang: string, text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { availableLanguages, selectedLanguageObjects } = useMemo(() => {
    const selectedSet = new Set(selectedLanguages);
    return {
      availableLanguages: azureLanguages.filter(l => !selectedSet.has(l.value)),
      selectedLanguageObjects: azureLanguages.filter(l => selectedSet.has(l.value)),
    };
  }, [selectedLanguages]);

  const handleLanguageSelect = (lang: AzureLanguageCode) => {
    if (selectedLanguages.length < 4) {
      setSelectedLanguages(prev => [...prev, lang]);
    } else {
      toast({ variant: 'destructive', title: 'Limit Reached', description: 'You can select a maximum of 4 languages.' });
    }
  };

  const removeLanguage = (langToRemove: AzureLanguageCode) => {
    setSelectedLanguages(prev => prev.filter(lang => lang !== langToRemove));
  };

  const handleStartTest = async () => {
    if (selectedLanguages.length < 1) {
        toast({ variant: 'destructive', title: 'No Languages', description: 'Please select at least one language to detect.' });
        return;
    }
    setError(null);
    setResult(null);
    setStatus('listening');

    try {
      const recognitionResult = await recognizeWithAutoDetect(selectedLanguages);
      setStatus('processing');
      setResult(recognitionResult);
    } catch (e: any) {
      console.error('Error during auto-detect test:', e);
      if (e.message !== 'Recognition was aborted.') {
        setError(e.message || 'An unknown error occurred.');
      }
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Azure Speech Auto-Detect Test</CardTitle>
          <CardDescription>
            Select up to 4 languages, then press the button and speak. The microphone will stop automatically after a pause.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Candidate Languages (Max 4)</Label>
            <div className="p-2 border rounded-md min-h-[4rem] flex flex-wrap gap-2 items-center">
              {selectedLanguageObjects.map(lang => (
                <Badge key={lang.value} variant="secondary" className="text-base py-1 px-3">
                  {lang.label}
                  <button onClick={() => removeLanguage(lang.value)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedLanguages.length < 4 && (
                <Select onValueChange={(val) => handleLanguageSelect(val as AzureLanguageCode)} value="">
                  <SelectTrigger className="w-48 border-dashed">
                    <SelectValue placeholder="Add a language..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLanguages.map(lang => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <Button onClick={handleStartTest} disabled={status !== 'idle'} size="lg">
              {status === 'listening' ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : <Mic className="mr-2 h-5 w-5" />}
              {status === 'listening' ? 'Listening...' : 'Start Test'}
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Status & Results</h3>
             <div className="p-4 bg-muted rounded-md space-y-2">
                <p><strong>Status:</strong> <span className="capitalize">{status}</span></p>
             </div>
            {result && (
              <div className="p-4 bg-secondary rounded-md space-y-2">
                <p><strong>Detected Language:</strong> {getAzureLanguageLabel(result.detectedLang)} ({result.detectedLang})</p>
                <p><strong>Recognized Text:</strong> "{result.text}"</p>
              </div>
            )}
            {error && (
              <div className="p-4 bg-destructive/20 text-destructive rounded-md">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
