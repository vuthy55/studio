
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
  DialogClose,
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
  createdAt: any;
};

export default function ConversePage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('english');
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  const { toast } = useToast();

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
    if (!newRoomName.trim() || !user || !selectedLanguage) return;

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
        currentSpeaker: null,
      });
      setNewRoomName('');
      router.push(`/converse/${docRef.id}?lang=${selectedLanguage}`);
    } catch (error) {
      console.error('Error creating room:', error);
       toast({ variant: 'destructive', title: 'Error', description: 'Could not create the room.' });
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

  const handleJoinClick = (roomId: string) => {
    setJoiningRoomId(roomId);
    setIsJoinDialogOpen(true);
  };

  const handleConfirmJoin = () => {
    if (joiningRoomId && selectedLanguage) {
      router.push(`/converse/${joiningRoomId}?lang=${selectedLanguage}`);
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
        <Dialog>
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
                  Give your room a name and choose your language.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Room Name</Label>
                  <Input
                    id="name"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="E.g. Thai Food Practice"
                    required
                  />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="language-select-create">Your Speaking Language</Label>
                  <Select value={selectedLanguage} onValueChange={(v) => setSelectedLanguage(v as LanguageCode)}>
                    <SelectTrigger id="language-select-create">
                      <SelectValue placeholder="Select a language" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {languages.map(lang => (
                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isCreatingRoom}>
                  {isCreatingRoom ? <LoaderCircle className="animate-spin" /> : 'Create & Join'}
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
                    <CardTitle className="flex items-center gap-2 cursor-pointer" onClick={() => handleJoinClick(room.id)}>
                      <MessagesSquare className="text-primary" /> {room.name}
                    </CardTitle>
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
                 <CardDescription>
                    Created by {room.creatorName || 'a user'}
                  </CardDescription>
              </CardContent>
              <CardFooter className="flex flex-col items-start gap-4">
                 <Button className="w-full" onClick={() => handleJoinClick(room.id)}>Join Room</Button>
                 <p className="text-xs text-muted-foreground">
                    {room.createdAt?.toDate().toLocaleString()}
                </p>
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
       <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Your Language</DialogTitle>
            <DialogDescription>Choose the language you will be speaking in the room.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
             <Label htmlFor="language-select-join">Your Speaking Language</Label>
            <Select value={selectedLanguage} onValueChange={(v) => setSelectedLanguage(v as LanguageCode)}>
              <SelectTrigger id="language-select-join">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent position="popper">
                {languages.map(lang => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmJoin}>Join Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
