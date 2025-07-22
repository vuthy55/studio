
"use client";

import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoaderCircle, Mic, X, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { recognizeWithAutoDetect, abortRecognition } from '@/services/speech';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';


type RecognitionStatus = 'idle' | 'listening' | 'processing' | 'speaking';

export default function TestAutoDetectPage() {
  const { toast } = useToast();
  const [selectedLanguages, setSelectedLanguages] = useState<AzureLanguageCode[]>(['en-US', 'th-TH', 'es-MX']);
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [result, setResult] = useState<{ detectedLang: string, text: string } | null>(null);
  const [speakingLanguage, setSpeakingLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

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

  const handleStopTest = () => {
    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }
    abortRecognition();
    setStatus('idle');
    setResult(null);
    setSpeakingLanguage(null);
    setError('Recognition manually stopped.');
  }

  const processAndSpeak = async (originalText: string, detectedLang: string) => {
    const targetLanguages = selectedLanguages.filter(l => l !== detectedLang);
    setStatus('speaking');

    for (const targetLang of targetLanguages) {
        const targetLangLabel = getAzureLanguageLabel(targetLang);
        setSpeakingLanguage(targetLangLabel);
        
        try {
            const translation = await translateText({
                text: originalText,
                fromLanguage: getAzureLanguageLabel(detectedLang),
                toLanguage: targetLangLabel,
            });

            const { audioDataUri } = await generateSpeech({
                text: translation.translatedText,
                lang: targetLang,
            });
            
            if (audioPlayerRef.current) {
                audioPlayerRef.current.src = audioDataUri;
                await audioPlayerRef.current.play();
                 await new Promise(resolve => {
                    if (audioPlayerRef.current) {
                        audioPlayerRef.current.onended = resolve;
                    }
                });
            }
        } catch(e: any) {
            console.error(`Error during TTS for ${targetLangLabel}:`, e);
            toast({ variant: 'destructive', title: 'Audio Error', description: `Could not play audio for ${targetLangLabel}`});
            // Continue to the next language
        }
    }
  }

  const handleStartTest = async () => {
    if (selectedLanguages.length < 2) {
        toast({ variant: 'destructive', title: 'Not Enough Languages', description: 'Please select at least two languages to test translation.' });
        return;
    }
    setError(null);
    setResult(null);
    setSpeakingLanguage(null);
    setStatus('listening');

    timeoutRef.current = setTimeout(() => {
        abortRecognition();
        setStatus('idle');
        setError('Recognition timed out after 30 seconds.');
    }, 30000);

    try {
      const recognitionResult = await recognizeWithAutoDetect(selectedLanguages);
      setStatus('processing');
      setResult(recognitionResult);
      // After recognition, process and speak translations
      await processAndSpeak(recognitionResult.text, recognitionResult.detectedLang);
    } catch (e: any) {
      console.error('Error during auto-detect test:', e);
      if (e.message !== 'Recognition was aborted.') {
        setError(e.message || 'An unknown error occurred.');
      }
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setStatus('idle');
      setSpeakingLanguage(null);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Azure Speech Auto-Detect & Translate Test</CardTitle>
          <CardDescription>
            Select 2-4 languages, press the button, and speak. It will detect your language, translate to the others, and speak them aloud.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Candidate Languages (Max 4)</Label>
            <div className="p-2 border rounded-md min-h-[4rem] flex flex-wrap gap-2 items-center">
              {selectedLanguageObjects.map(lang => (
                <Badge key={lang.value} variant="secondary" className="text-base py-1 px-3">
                  {lang.label}
                  <button onClick={() => removeLanguage(lang.value)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5" disabled={status !== 'idle'}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedLanguages.length < 4 && (
                <Select onValueChange={(val) => handleLanguageSelect(val as AzureLanguageCode)} value="" disabled={status !== 'idle'}>
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

          <div className="flex justify-center gap-4">
            <Button onClick={handleStartTest} disabled={status !== 'idle'} size="lg">
              <Mic className="mr-2 h-5 w-5" />
              Start Test
            </Button>
             <Button onClick={handleStopTest} disabled={status === 'idle'} variant="destructive" size="lg">
              <X className="mr-2 h-5 w-5" />
              Stop
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Status & Results</h3>
             <div className="p-4 bg-muted rounded-md space-y-2 text-sm">
                <p><strong>Status:</strong> 
                    <span className="capitalize ml-2">
                        {status === 'listening' && <LoaderCircle className="inline-block mr-2 h-4 w-4 animate-spin" />}
                        {status === 'speaking' && <Volume2 className="inline-block mr-2 h-4 w-4 text-primary" />}
                        {status}
                    </span>
                </p>
                {speakingLanguage && <p><strong>Now Speaking:</strong> {speakingLanguage}</p>}
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
      <audio ref={audioPlayerRef} className="hidden" />
    </div>
  );
}
