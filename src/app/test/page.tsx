
'use client';

import { runTestFlow } from '@/ai/flows/test-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import BuyTokens from '@/components/BuyTokens';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { getAllRooms, type ClientSyncRoom } from '@/services/rooms';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { permanentlyDeleteRooms } from '@/actions/room';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


function RoomTrackingTest() {
  const [rooms, setRooms] = useState<ClientSyncRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const { toast } = useToast();

  const handleFetchRooms = async () => {
    setIsLoading(true);
    setError('');
    setSelectedRoomIds([]); // Reset selection on fetch
    console.log("Attempting to fetch rooms...");
    try {
      const fetchedRooms = await getAllRooms();
      console.log("Fetched rooms from server:", fetchedRooms);
      setRooms(fetchedRooms);
    } catch (e: any) {
      console.error('Error fetching rooms:', e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRoomIds(rooms.map(r => r.id));
    } else {
      setSelectedRoomIds([]);
    }
  };

  const handleSelectRoom = (roomId: string, checked: boolean) => {
    setSelectedRoomIds(prev => {
      if (checked) {
        return [...prev, roomId];
      } else {
        return prev.filter(id => id !== roomId);
      }
    });
  };

  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      const result = await permanentlyDeleteRooms(selectedRoomIds);
      if (result.success) {
        toast({ title: "Success", description: `${selectedRoomIds.length} room(s) permanently deleted.` });
        handleFetchRooms(); // Refresh the list
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (e: any) {
       toast({ variant: 'destructive', title: 'Client Error', description: 'Failed to call the delete action.' });
    } finally {
      setIsDeleting(false);
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
          This tests the "soft" and "hard" delete functionality. Fetch rooms, select them, and use the delete button to permanently remove them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
            <Button onClick={handleFetchRooms} disabled={isLoading}>
                {isLoading ? <LoaderCircle className="animate-spin" /> : 'Fetch All Rooms'}
            </Button>
            {selectedRoomIds.length > 0 && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isDeleting}>
                            {isDeleting ? <LoaderCircle className="animate-spin mr-2" /> : <Trash2 className="mr-2" />}
                            Delete ({selectedRoomIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action is permanent and cannot be undone. This will permanently delete the selected {selectedRoomIds.length} room(s).
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>

        {error && (
          <div className="p-4 bg-destructive/20 text-destructive rounded-md">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}
        
        {rooms.length > 0 && (
          <div className="flex items-center space-x-2 py-2">
            <Checkbox 
                id="select-all"
                onCheckedChange={handleSelectAll}
                checked={selectedRoomIds.length === rooms.length && rooms.length > 0}
            />
            <label htmlFor="select-all" className="text-sm font-medium">Select All</label>
          </div>
        )}

        {rooms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Active Rooms ({activeRooms.length})</h4>
              <ul className="p-2 border rounded-md space-y-1 text-sm">
                {activeRooms.map(room => (
                  <li key={room.id} className="flex items-center gap-3">
                    <Checkbox id={room.id} onCheckedChange={(checked) => handleSelectRoom(room.id, !!checked)} checked={selectedRoomIds.includes(room.id)}/>
                    <label htmlFor={room.id} className="flex-grow">{room.topic}</label>
                    <Badge variant="default">Active</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Closed Rooms ({closedRooms.length})</h4>
              <ul className="p-2 border rounded-md space-y-1 text-sm">
                {closedRooms.map(room => (
                  <li key={room.id} className="flex items-center gap-3">
                    <Checkbox id={room.id} onCheckedChange={(checked) => handleSelectRoom(room.id, !!checked)} checked={selectedRoomIds.includes(room.id)} />
                    <label htmlFor={room.id} className="flex-grow">{room.topic}</label>
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
