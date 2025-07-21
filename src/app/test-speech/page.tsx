
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoaderCircle, CheckCircle, XCircle } from 'lucide-react';
import { assessPronunciationFromMic, type PronunciationAssessmentResult } from '@/services/speech';

export default function TestSpeechPage() {
  const [result, setResult] = useState<PronunciationAssessmentResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const referenceText = "Hello world, this is a test.";
  const language = "english";

  const handleTest = async () => {
    setError('');
    setResult(null);
    setIsLoading(true);
    try {
      const assessmentResult = await assessPronunciationFromMic(referenceText, language);
      setResult(assessmentResult);
    } catch (e: any) {
      console.error('Error during speech assessment test:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Azure Speech Assessment Test (Auto-Stop)</CardTitle>
          <CardDescription>
            This page tests the seamless speech recognition service. Press the button, speak, and the microphone will stop automatically after you pause.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Press "Start Test", then say the phrase <strong className="text-primary">"{referenceText}"</strong> into your microphone.
          </p>
          <Button onClick={handleTest} disabled={isLoading} className="w-full">
            {isLoading ? <LoaderCircle className="animate-spin" /> : null}
            {isLoading ? 'Listening...' : 'Start Test'}
          </Button>
         
          {result && (
            <div className="p-4 bg-secondary rounded-md space-y-2">
              <p className="font-semibold flex items-center gap-2">
                Assessment Result: 
                {result.isPass ? <CheckCircle className="text-green-500" /> : <XCircle className="text-red-500" />}
                <span className={`font-bold ${result.isPass ? 'text-green-600' : 'text-red-600'}`}>
                  {result.isPass ? 'Pass' : 'Fail'}
                </span>
              </p>
              <ul className="list-disc pl-5">
                <li>Accuracy Score: <span className="font-bold">{result.accuracy.toFixed(0)}</span></li>
                <li>Fluency Score: <span className="font-bold">{result.fluency.toFixed(0)}</span></li>
                <li>Completeness Score: <span className="font-bold">{result.completeness.toFixed(0)}</span></li>
                <li>Pronunciation Score: <span className="font-bold">{result.pronScore.toFixed(0)}</span></li>
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
