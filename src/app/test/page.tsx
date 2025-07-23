
'use client';

import { runTestFlow } from '@/ai/flows/test-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { LoaderCircle } from 'lucide-react';
import BuyTokens from '@/components/BuyTokens';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { Badge } from '@/components/ui/badge';

function RoomTrackingTest() {
  const [rooms, setRooms] = useState<ClientSyncRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFetchRooms = async () => {
    setIsLoading(true);
    setError('');
    try {
      const fetchedRooms = await getAllRooms();
      setRooms(fetchedRooms);
    } catch (e: any) {
      console.error('Error fetching rooms:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const { activeRooms, closedRooms } = useMemo(() => {
    return {
      activeRooms: rooms.filter(r => r.status === 'active'),
      closedRooms: rooms.filter(r => r.status === 'closed'),
    };
  }, [rooms]);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Room Deletion Tracking Test</CardTitle>
        <CardDescription>
          This tests the "soft delete" functionality. Click the button to fetch all rooms from Firestore and view their status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleFetchRooms} disabled={isLoading}>
          {isLoading ? <LoaderCircle className="animate-spin" /> : 'Fetch All Rooms'}
        </Button>
        {error && (
          <div className="p-4 bg-destructive/20 text-destructive rounded-md">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}
        {rooms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Active Rooms ({activeRooms.length})</h4>
              <ul className="p-2 border rounded-md space-y-1 text-sm">
                {activeRooms.map(room => (
                  <li key={room.id} className="flex justify-between items-center">
                    <span>{room.topic}</span>
                    <Badge variant="default">Active</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Closed Rooms ({closedRooms.length})</h4>
              <ul className="p-2 border rounded-md space-y-1 text-sm">
                {closedRooms.map(room => (
                  <li key={room.id} className="flex justify-between items-center">
                    <span>{room.topic}</span>
                    <Badge variant="destructive">Closed</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


export default function TestPage() {
  const [user] = useAuthState(auth);
  const [name, setName] = useState('programmers');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hardcoded list of known working models for this environment.
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
      <RoomTrackingTest />

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
}
