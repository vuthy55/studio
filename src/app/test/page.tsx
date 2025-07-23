
'use client';

import { runTestFlow } from '@/ai/flows/test-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { LoaderCircle, CheckCircle, XCircle } from 'lucide-react';
import BuyTokens from '@/components/BuyTokens';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { assessPronunciationFromMic, type PronunciationAssessmentResult } from '@/services/speech';


function SpeechAssessmentTest() {
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
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Azure Speech Assessment Test</CardTitle>
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
  )
}


const TestPage = () => {
  const [user] = useAuthState(auth);
  const [name, setName] = useState('programmers');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const models = [
    'googleai/gemini-2.0-flash',
    'googleai/gemini-pro',
    'googleai/gemini-2.0-flash-preview-image-generation',
    'googleai/gemini-2.5-flash-preview-tts',
  ];

  const handleRunTest = async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const response = await runTestFlow(name);
      setResult(response);
    } catch (e: any) {
      console.error('Error running test flow:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Genkit AI Test Page</CardTitle>
          <CardDescription>This page tests the AI functionality and lists available models.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Enter a topic and click the button to get a joke. This uses the `googleai/gemini-2.0-flash` model.
          </p>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a topic for a joke"
            />
            <Button onClick={handleRunTest} disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : 'Run Test Flow'}
            </Button>
          </div>
          {result && (
            <div className="p-4 bg-secondary rounded-md">
              <p className="font-semibold">AI Response:</p>
              <p>{result}</p>
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

      <SpeechAssessmentTest />

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle>PayPal Sandbox Test</CardTitle>
            <CardDescription>
                Click the button below to test the PayPal checkout flow. Ensure you have set your sandbox credentials in the <code>.env.local</code> file.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {user ? (
                <BuyTokens />
            ) : (
                <p className="text-muted-foreground">Please log in to test token purchases.</p>
            )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Available AI Models</CardTitle>
          <CardDescription>This is a list of known compatible models for this app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1 bg-secondary p-4 rounded-md">
            {models.map((model) => (
              <li key={model} className="font-mono text-sm">{model}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestPage;
