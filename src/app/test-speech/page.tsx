
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';
import { assessPronunciationFromMic, type PronunciationAssessmentResult } from '@/services/speech';

export default function TestSpeechPage() {
  const [result, setResult] = useState<PronunciationAssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const referenceText = "Hello world";
  const language = "english";

  const handleRunTest = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await assessPronunciationFromMic(referenceText, language);
      setResult(response);
    } catch (e: any) {
      console.error('Error running speech assessment test:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Azure Speech Assessment Test</CardTitle>
          <CardDescription>
            This page tests the `assessPronunciationFromMic` function in isolation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <p>
                Click the button and say: <strong className="text-primary">"{referenceText}"</strong>
            </p>
          <div className="flex gap-2">
            <Button onClick={handleRunTest} disabled={loading} className="w-full">
              {loading ? <LoaderCircle className="animate-spin" /> : 'Start Microphone Test'}
            </Button>
          </div>
          {loading && (
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
