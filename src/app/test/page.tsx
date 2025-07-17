
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';
import { runTestFlow } from '@/ai/flows/test-flow';

export default function TestPage() {
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRunTest = async () => {
    setIsLoading(true);
    setError('');
    setResult('');
    try {
      const response = await runTestFlow();
      setResult(response);
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Genkit AI Test Page</CardTitle>
          <CardDescription>
            Click the button to run a simple test flow. This will call the Gemini API with a basic prompt ("Tell me a one-sentence joke.") to verify that the Genkit setup and API key are working correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleRunTest} disabled={isLoading}>
            {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run Test Flow
          </Button>

          {result && (
            <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
              <p className="font-bold">Success!</p>
              <p>AI Response: {result}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              <p className="font-bold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
