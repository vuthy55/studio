
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { generateSpeech } from '@/ai/flows/tts-flow';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { languages, LanguageCode } from '@/lib/data';
import { LoaderCircle, Mic, MicOff, LogOut, XSquare, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Room = {
  name: string;
  createdBy: string;
  isActive: boolean;
  currentSpeaker: Speaker | null;
};

type Participant = {
  id: string;
  name: string;
  language: LanguageCode;
};

type Speaker = {
  userId: string;
  userName: string;
  text: string;
  language: LanguageCode;
  timestamp: number;
};

const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
  english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
  malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
  chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};

export default function RoomPage() {
  const [user, authLoading] = useAuthState(auth);
  const router = useRouter();
  const { roomId } = useParams() as { roomId: string };
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [myLanguage, setMyLanguage] = useState<LanguageCode>('english');

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<Speaker | null>(null);
  const lastPlayedTimestamp = useRef(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);
  
  const enterRoom = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const participantData = {
        id: user.uid,
        name: userDoc.exists() ? userDoc.data().name : user.displayName || 'Anonymous',
        language: myLanguage,
      };
      await setDoc(doc(db, 'rooms', roomId, 'participants', user.uid), participantData);
    } catch (error) {
      console.error('Error entering room:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not enter room.' });
      router.push('/converse');
    }
  }, [user, roomId, myLanguage, toast, router]);

  const leaveRoom = useCallback(async () => {
    if (!user || !roomId) return;
    await deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
    router.push('/converse');
  }, [user, roomId, router]);

  const endSession = async () => {
    if (!isCreator) return;
    await updateDoc(doc(db, 'rooms', roomId), { isActive: false, currentSpeaker: null });
  };
  
  useEffect(() => {
    if (!user || !roomId) return;
  
    enterRoom();
  
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
    };
  
    window.addEventListener('beforeunload', handleBeforeUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
    };
  }, [user, roomId, enterRoom]);
  

  useEffect(() => {
    if (!roomId) return;

    const roomDocRef = doc(db, 'rooms', roomId);
    const participantsColRef = collection(db, 'rooms', roomId, 'participants');

    const unsubRoom = onSnapshot(roomDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const roomData = docSnap.data() as Room;
        setRoom(roomData);
        setLoading(false);
        if (user) {
          setIsCreator(roomData.createdBy === user.uid);
        }

        if (!roomData.isActive) {
          toast({ title: 'Session Ended', description: 'The host has ended the session.' });
          router.push('/converse');
        }
        
        const speaker = roomData.currentSpeaker;
        if (speaker && speaker.timestamp > lastPlayedTimestamp.current) {
            lastPlayedTimestamp.current = speaker.timestamp;
            setCurrentSpeaker(speaker);
        }

      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Room not found.' });
        router.push('/converse');
      }
    });

    const unsubParticipants = onSnapshot(participantsColRef, (snapshot) => {
      const parts = snapshot.docs.map((doc) => doc.data() as Participant);
      setParticipants(parts);
    });

    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomId, user, router, toast]);

  useEffect(() => {
    if(currentSpeaker && user && currentSpeaker.userId !== user.uid) {
        const playAudio = async () => {
            const locale = languageToLocaleMap[currentSpeaker.language];
            if (!locale) return;
            try {
                const response = await generateSpeech({ text: currentSpeaker.text, lang: locale });
                const audio = new Audio(response.audioDataUri);
                audio.play();
            } catch (error) {
                console.error("TTS playback error:", error);
            }
        };
        playAudio();
    }
  }, [currentSpeaker, user]);


  const handleMicClick = async () => {
    if (isSpeaking || currentSpeaker) return;
    setIsSpeaking(true);

    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
        setIsSpeaking(false);
        return;
    }
    const locale = languageToLocaleMap[myLanguage];
    if (!locale) {
        toast({ variant: 'destructive', title: 'Unsupported Language' });
        setIsSpeaking(false);
        return;
    }

    let recognizer: sdk.SpeechRecognizer | undefined;
    try {
        const roomDocRef = doc(db, 'rooms', roomId);

        await runTransaction(db, async (transaction) => {
            const roomDoc = await transaction.get(roomDocRef);
            if (!roomDoc.exists() || roomDoc.data().currentSpeaker) {
                throw new Error("Another user is already speaking.");
            }
            const speakerPayload = {
                userId: user!.uid,
                userName: participants.find(p => p.id === user!.uid)?.name || 'Anonymous',
                text: '...', 
                language: myLanguage,
                timestamp: Date.now()
            };
            transaction.update(roomDocRef, { currentSpeaker: speakerPayload });
        });

        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        speechConfig.speechRecognitionLanguage = locale;
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
            recognizer!.recognizeOnceAsync(resolve, reject);
        });

        if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
            const newSpeakerPayload = {
                userId: user!.uid,
                userName: participants.find(p => p.id === user!.uid)?.name || 'Anonymous',
                text: result.text,
                language: myLanguage,
                timestamp: Date.now(),
            };
            await updateDoc(roomDocRef, { currentSpeaker: newSpeakerPayload });
        } else {
             await updateDoc(roomDocRef, { currentSpeaker: null });
        }

        setTimeout(async () => {
            await updateDoc(roomDocRef, { currentSpeaker: null });
        }, 2000);

    } catch (error: any) {
        console.error("Error during speech recognition or transaction:", error);
        if (error.message !== "Another user is already speaking.") {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not process speech.' });
        }
    } finally {
        if (recognizer) recognizer.close();
        setIsSpeaking(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return <div className="text-center p-8">Room not found or session has ended.</div>;
  }
  
  const canSpeak = !currentSpeaker && !isSpeaking;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-secondary/30">
        <main className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold font-headline">{room.name}</h1>
                    <p className="text-muted-foreground">A real-time conversation practice room.</p>
                </div>
                <div className="flex items-center gap-2">
                    {isCreator ? (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive"><XSquare className="mr-2"/> End Session</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will end the session for everyone. This action cannot be undone.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={endSession}>End Session</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : (
                        <Button variant="outline" onClick={leaveRoom}><LogOut className="mr-2"/> Leave</Button>
                    )}
                </div>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center space-y-8 bg-background rounded-lg shadow-inner p-8">
                <div className='text-center'>
                    <div className="flex items-center space-x-2 justify-center mb-4">
                        <Users className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-bold">{participants.length} Participant(s)</h2>
                    </div>
                     <div className="flex flex-wrap justify-center gap-4">
                        {participants.map(p => (
                            <Badge key={p.id} variant={currentSpeaker?.userId === p.id ? 'default' : 'secondary'} className="text-lg p-2">
                                {p.name} ({p.language})
                                {currentSpeaker?.userId === p.id && <Mic className="ml-2 h-4 w-4 animate-pulse"/>}
                            </Badge>
                        ))}
                    </div>
                </div>
               
                <div className="text-center w-full max-w-md space-y-4">
                    <p className="text-muted-foreground">Select your spoken language and press the mic to talk.</p>
                    <Select value={myLanguage} onValueChange={(value) => setMyLanguage(value as LanguageCode)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                        <SelectContent>
                            {languages.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                 <Button 
                    onClick={handleMicClick} 
                    disabled={!canSpeak} 
                    className={cn(
                        "rounded-full h-24 w-24 transition-all duration-300 transform hover:scale-105 shadow-lg",
                        isSpeaking && "bg-yellow-500",
                        !canSpeak && "bg-muted-foreground cursor-not-allowed",
                        canSpeak && "bg-green-500 hover:bg-green-600"
                    )}
                >
                    {isSpeaking || currentSpeaker ? <Mic className="h-10 w-10 text-white" /> : <MicOff className="h-10 w-10 text-white" />}
                </Button>
                 <div className="h-8">
                    {currentSpeaker ? (
                        <p className='text-lg animate-pulse font-semibold'>{currentSpeaker.userName} is speaking...</p>
                    ) : (
                       <p className="text-muted-foreground">{ canSpeak ? 'Press the mic to talk' : 'Another user is speaking...'}</p>
                    )}
                </div>

            </div>
        </main>
    </div>
  );
}
