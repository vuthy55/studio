
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LoaderCircle, MessagesSquare, Plus } from 'lucide-react';
import Link from 'next/link';

type Room = {
  id: string;
  name: string;
  createdBy: string;
  creatorName: string;
  language: string;
  createdAt: any;
};

export default function ConversePage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const roomsData: Room[] = [];
        querySnapshot.forEach((doc) => {
          roomsData.push({ id: doc.id, ...doc.data() } as Room);
        });
        setRooms(roomsData);
        setIsLoadingRooms(false);
      },
      (error) => {
        console.error('Error fetching rooms:', error);
        setIsLoadingRooms(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !user) return;

    setIsCreatingRoom(true);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userName = userDoc.exists() ? userDoc.data().name : user.displayName || 'Anonymous';

      const docRef = await addDoc(collection(db, 'rooms'), {
        name: newRoomName,
        createdBy: user.uid,
        creatorName: userName,
        createdAt: serverTimestamp(),
      });
      setNewRoomName('');
      setIsDialogOpen(false);
      router.push(`/converse/${docRef.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  if (loading || isLoadingRooms) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
        <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Conversation Rooms</h1>
          <p className="text-muted-foreground">
            Join a room to practice speaking with others.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2" />
              Create Room
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateRoom}>
              <DialogHeader>
                <DialogTitle>Create a new room</DialogTitle>
                <DialogDescription>
                  Give your new conversation room a name. Click create when you're done.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="col-span-3"
                    placeholder="E.g. Thai Food Practice"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isCreatingRoom}>
                  {isCreatingRoom ? <LoaderCircle className="animate-spin" /> : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {rooms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link key={room.id} href={`/converse/${room.id}`} passHref>
              <Card className="hover:bg-accent/50 transition-colors h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessagesSquare className="text-primary" /> {room.name}
                  </CardTitle>
                  <CardDescription>
                    Created by {room.creatorName || 'a user'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow"></CardContent>
                <CardFooter>
                  <p className="text-xs text-muted-foreground">
                    {room.createdAt?.toDate().toLocaleString()}
                  </p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <MessagesSquare className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No conversation rooms yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Be the first to create one!</p>
        </div>
      )}
    </div>
  );
}
