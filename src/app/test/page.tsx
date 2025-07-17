
'use client';

import { runTestFlow } from '@/ai/flows/test-flow';
import { getAvailableModels } from '@/ai/flows/list-models-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';

export default function TestPage() {
  const [name, setName] = useState('programmers');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoadingModels(true);
        const availableModels = await getAvailableModels();
        setModels(availableModels);
      } catch (e: any) {
        console.error('Error fetching models:', e);
        setError('Could not fetch available models.');
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

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
            Enter a topic and click the button to get a joke.
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

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Available AI Models</CardTitle>
          <CardDescription>This is the list of models Genkit has detected.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingModels ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle className="animate-spin h-5 w-5" />
              <p>Loading models...</p>
            </div>
          ) : (
            <ul className="list-disc pl-5 space-y-1 bg-secondary p-4 rounded-md">
              {models.map((model) => (
                <li key={model} className="font-mono text-sm">{model}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
