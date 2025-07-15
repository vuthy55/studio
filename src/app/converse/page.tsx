
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
  getDoc,
  limit,
  deleteDoc,
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
import { LoaderCircle, MessagesSquare, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { languages, LanguageCode } from '@/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


type Room = {
  id: string;
  name: string;
  createdBy: string;
  creatorName: string;
  language: string;
  createdAt: any;
  isActive: boolean;
};

export default function ConversePage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(3));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const roomsData: Room[] = [];
        querySnapshot.forEach((doc) => {
          if (doc.data().isActive !== false) {
             roomsData.push({ id: doc.id, ...doc.data() } as Room);
          }
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
        isActive: true,
        currentSpeaker: null,
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

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      toast({ title: 'Room Deleted', description: 'The conversation room has been successfully deleted.' });
    } catch (error) {
      console.error('Error deleting room:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete the room.' });
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
            <Card key={room.id} className="hover:bg-accent/50 transition-colors h-full flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                     <Link href={`/converse/${room.id}`} passHref>
                        <CardTitle className="flex items-center gap-2 cursor-pointer">
                          <MessagesSquare className="text-primary" /> {room.name}
                        </CardTitle>
                      </Link>
                      <CardDescription>
                        Created by {room.creatorName || 'a user'}
                      </CardDescription>
                  </div>
                  {user && user.uid === room.createdBy && (
                     <AlertDialog>
                      <AlertDialogTrigger asChild>
                         <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                           <Trash2 className="h-4 w-4 text-destructive" />
                         </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the room. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteRoom(room.id)}>Delete Room</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                 <Link href={`/converse/${room.id}`} className="block h-full">
                    <span className="sr-only">Join room {room.name}</span>
                 </Link>
              </CardContent>
              <CardFooter>
                 <Link href={`/converse/${room.id}`} className="w-full">
                    <p className="text-xs text-muted-foreground">
                      {room.createdAt?.toDate().toLocaleString()}
                    </p>
                 </Link>
              </CardFooter>
            </Card>
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
