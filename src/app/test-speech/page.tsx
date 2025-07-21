
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';
import { startPronunciationAssessment, stopPronunciationAssessment, type PronunciationAssessmentResult } from '@/services/speech';

export default function TestSpeechPage() {
  const [result, setResult] = useState<PronunciationAssessmentResult | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');

  const referenceText = "Hello world";
  const language = "english";

  const handleStart = async () => {
    setError('');
    setResult(null);
    setIsListening(true);
    try {
      await startPronunciationAssessment(referenceText, language);
    } catch (e: any) {
      console.error('Error starting speech assessment:', e);
      setError(e.message || 'An unknown error occurred during start.');
      setIsListening(false);
    }
  };

  const handleStop = async () => {
    if (!isListening) return;
    try {
      const assessmentResult = await stopPronunciationAssessment();
      setResult(assessmentResult);
    } catch (e: any) {
      console.error('Error stopping speech assessment:', e);
      setError(e.message || 'An unknown error occurred during stop.');
    } finally {
      setIsListening(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Azure Speech Assessment Test</CardTitle>
          <CardDescription>
            This page tests the speech service with manual start and stop controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Press "Start", say the phrase <strong className="text-primary">"{referenceText}"</strong>, then press "Stop".
          </p>
          <div className="flex gap-4">
            <Button onClick={handleStart} disabled={isListening} className="w-full">
              {isListening ? <LoaderCircle className="animate-spin" /> : null}
              Start Listening
            </Button>
            <Button onClick={handleStop} disabled={!isListening} className="w-full" variant="destructive">
              Stop Listening
            </Button>
          </div>
          {isListening && (
            <div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-md text-center">
              <p className="font-semibold">Listening...</p>
              <p className="text-sm text-muted-foreground">Please speak into your microphone.</p>
            </div>
          )}
          {result && (
            <div className="p-4 bg-secondary rounded-md space-y-2">
              <p className="font-semibold">Assessment Result:</p>
              <ul className="list-disc pl-5">
                <li>Accuracy Score: <span className="font-bold">{result.accuracy.toFixed(0)}</span></li>
                <li>Fluency Score: <span className="font-bold">{result.fluency.toFixed(0)}</span></li>
                <li>Completeness Score: <span className="font-bold">{result.completeness.toFixed(0)}</span></li>
                <li>Pronunciation Score: <span className="font-bold">{result.pronScore.toFixed(0)}</span></li>
                <li>Result: <span className="font-bold">{result.isPass ? 'Pass' : 'Fail'}</span></li>
              </ul>
            </div>
          )}
          {error && (
            <div className="p-4 bg-destructive/20 text-destructive rounded-md">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
