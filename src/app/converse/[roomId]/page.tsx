
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  doc,
  onSnapshot,
  runTransaction,
  deleteDoc,
  collection,
  query,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { generateSpeech } from '@/ai/flows/tts-flow';
import { translateText } from '@/app/actions';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { languages, LanguageCode } from '@/lib/data';
import { LoaderCircle, Mic, LogOut, XSquare, Users, Volume2 } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';

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
  const searchParams = useSearchParams();
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

  const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);

  useEffect(() => {
    const lang = searchParams.get('lang') as LanguageCode;
    if (lang && languages.some(l => l.value === lang)) {
      setMyLanguage(lang);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const enterRoom = useCallback(async (retries = 3, delay = 500) => {
    if (!user || !roomId) return;
    try {
        await runTransaction(db, async (transaction) => {
            const roomDocRef = doc(db, 'rooms', roomId);
            const roomDoc = await transaction.get(roomDocRef);
            if (!roomDoc.exists()) {
                if (retries > 0) {
                    throw new Error('RETRY');
                }
                throw new Error('Room not found or has been ended.');
            }

            const participantData = {
                id: user.uid,
                name: user.displayName || 'Anonymous',
                language: myLanguage,
            };
            const participantDocRef = doc(db, 'rooms', roomId, 'participants', user.uid);
            transaction.set(participantDocRef, participantData);
        });
    } catch (error: any) {
        if (error.message === 'RETRY' && retries > 0) {
            console.log(`Room not found, retrying in ${delay}ms... (${retries} retries left)`);
            setTimeout(() => enterRoom(retries - 1, delay), delay);
        } else {
            console.error('Error entering room:', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not enter room.' });
            router.push('/converse');
        }
    }
}, [user, roomId, myLanguage, toast, router]);


  const leaveRoom = useCallback(async () => {
    if (!user || !roomId) return;
    try {
        await deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
    } catch (error) {
        console.error("Error leaving room: ", error);
    } finally {
        router.push('/converse');
    }
  }, [user, roomId, router]);

  const endSession = async () => {
    if (!isCreator || !roomId) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      toast({ title: 'Session Ended', description: 'The room has been deleted.' });
      router.push('/converse');
    } catch (error) {
      console.error('Error deleting room:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not end the session.' });
    }
  };
  
  useEffect(() => {
    if (!user || !roomId || !myLanguage) return;
    enterRoom();
    
    const handleBeforeUnload = () => {
        if (user && roomId) {
            deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (user && roomId) {
         deleteDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
      }
    };
  }, [user, roomId, myLanguage, enterRoom]);

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
        
        const speaker = roomData.currentSpeaker;
        if (speaker && speaker.timestamp > lastPlayedTimestamp.current) {
            lastPlayedTimestamp.current = speaker.timestamp;
            setCurrentSpeaker(speaker);
        }
      } else {
        toast({ title: 'Session Ended', description: 'This room is no longer active.' });
        router.push('/converse');
      }
    });

    const unsubParticipants = onSnapshot(query(participantsColRef), (snapshot) => {
      const parts = snapshot.docs.map((doc) => doc.data() as Participant);
      setParticipants(parts);
    });

    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomId, user, router, toast]);

  useEffect(() => {
    if (currentSpeaker && user && currentSpeaker.userId !== user.uid) {
      const playTranslatedAudio = async () => {
        if (!currentSpeaker.text) return;
  
        const speakerLangLabel = languages.find(l => l.value === currentSpeaker.language)?.label || currentSpeaker.language;
        const listenerLangLabel = languages.find(l => l.value === myLanguage)?.label || myLanguage;
        const listenerLocale = languageToLocaleMap[myLanguage];
  
        if (!listenerLocale) return;
  
        try {
          // 1. Translate the speaker's text to the listener's language
          const translationResult = await translateText({
            text: currentSpeaker.text,
            fromLanguage: speakerLangLabel,
            toLanguage: listenerLangLabel,
          });
  
          if (translationResult.error || !translationResult.translatedText) {
            throw new Error(translationResult.error || 'Translation failed');
          }
  
          // 2. Play the translated text using TTS in the listener's language
          const response = await generateSpeech({
            text: translationResult.translatedText,
            lang: listenerLocale,
          });
          const audio = new Audio(response.audioDataUri);
          await audio.play();
  
          // 3. After audio finishes, clear the speaker if creator
          audio.addEventListener('ended', async () => {
            if (isCreator) {
              await runTransaction(db, async (transaction) => {
                const roomDocRef = doc(db, 'rooms', roomId);
                const roomDoc = await transaction.get(roomDocRef);
                if (roomDoc.exists() && roomDoc.data().currentSpeaker?.timestamp === currentSpeaker.timestamp) {
                  transaction.update(roomDocRef, { currentSpeaker: null });
                }
              });
            }
          });
  
        } catch (error) {
          console.error("Audio playback error:", error);
          toast({ variant: 'destructive', title: 'Audio Error', description: 'Could not play translated audio.' });
          // Failsafe clear speaker on error if creator
          if (isCreator) {
            await runTransaction(db, async (transaction) => {
              const roomDocRef = doc(db, 'rooms', roomId);
              transaction.update(roomDocRef, { currentSpeaker: null });
            });
          }
        }
      };
      playTranslatedAudio();
    }
  }, [currentSpeaker, user, myLanguage, isCreator, roomId, toast]);
  

  const stopSpeaking = useCallback(async () => {
    if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(
            () => { /* Successfully stopped */ },
            (err) => console.error('Error stopping recognition:', err)
        );
    }
  }, []);

  const handleMicClick = async () => {
    if (isSpeaking) {
      await stopSpeaking();
      return;
    }

    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    if (!azureKey || !azureRegion) {
        toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
        return;
    }
    const locale = languageToLocaleMap[myLanguage];
    if (!locale) {
        toast({ variant: 'destructive', title: 'Unsupported Language' });
        return;
    }

    const roomDocRef = doc(db, 'rooms', roomId);

    try {
        await runTransaction(db, async (transaction) => {
            const roomDoc = await transaction.get(roomDocRef);
            if (!roomDoc.exists() || roomDoc.data().currentSpeaker) {
                throw new Error("Another user is already speaking.");
            }
            transaction.update(roomDocRef, { currentSpeaker: { userId: user!.uid, text: '...' } });
        });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not get speaking turn.' });
        return;
    }
    
    setIsSpeaking(true);
    const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    speechConfig.speechRecognitionLanguage = locale;
    // Shorter timeouts to detect pauses faster
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "3000");
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1500");

    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    recognizerRef.current = recognizer;

    let finalRecognizedText = '';
    
    recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            finalRecognizedText += ` ${e.result.text}`;
        }
    };
    
    recognizer.sessionStopped = async (s, e) => {
        setIsSpeaking(false);
        if (recognizerRef.current) {
             try {
                recognizerRef.current.close();
            } catch (e) {
                // Ignore if it's already disposed.
            }
            recognizerRef.current = null;
        }

        if (finalRecognizedText.trim()) {
            const speakerPayload = {
                userId: user!.uid,
                userName: participants.find(p => p.id === user!.uid)?.name || 'Anonymous',
                text: finalRecognizedText.trim(),
                language: myLanguage,
                timestamp: Date.now(),
            };
            await runTransaction(db, async (transaction) => {
                transaction.update(roomDocRef, { currentSpeaker: speakerPayload });
            });
        } else {
            // No speech detected, release the lock
            await runTransaction(db, async (transaction) => {
                 transaction.update(roomDocRef, { currentSpeaker: null });
            });
        }
    };
    
    recognizer.canceled = async (s, e) => {
        setIsSpeaking(false);
        if (recognizerRef.current) {
            try {
                recognizerRef.current.close();
            } catch (e) {
                // Ignore if it's already disposed.
            }
            recognizerRef.current = null;
        }
        await runTransaction(db, async (transaction) => {
            transaction.update(roomDocRef, { currentSpeaker: null });
       });
    };
    
    recognizer.startContinuousRecognitionAsync();
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
  
  const amISpeaking = room.currentSpeaker?.userId === user?.uid;
  const canSpeak = !room.currentSpeaker && !isSpeaking;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-secondary/30">
        <header className="flex-shrink-0 p-4 md:p-6 lg:p-8 flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold font-headline">{room.name}</h1>
                <p className="text-muted-foreground">A real-time conversation practice room.</p>
            </div>
            <div className="flex items-center gap-2">
                {isCreator ? (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive"><XSquare className="mr-2 h-4 w-4"/> End Session</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete the room for everyone. This action cannot be undone.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={endSession}>End & Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ) : (
                    <Button variant="outline" onClick={leaveRoom}><LogOut className="mr-2 h-4 w-4"/> Leave Room</Button>
                )}
            </div>
        </header>
        
        <main className="flex-grow flex flex-col md:flex-row p-4 md:p-6 lg:p-8 pt-0 md:pt-0 lg:pt-0 gap-6">
            <div className="w-full md:w-1/3 lg:w-1/4">
                 <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center space-x-2 justify-center mb-4">
                            <Users className="h-6 w-6 text-primary" />
                            <h2 className="text-xl font-bold">{participants.length} Participant(s)</h2>
                        </div>
                        <div className="flex flex-col gap-2">
                            {participants.map(p => (
                                <Badge key={p.id} variant={room.currentSpeaker?.userId === p.id ? 'default' : 'secondary'} className="text-base p-2 justify-between">
                                    <span>{p.name} ({p.language})</span>
                                    {room.currentSpeaker?.userId === p.id && <Mic className="ml-2 h-4 w-4 animate-pulse"/>}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                 </Card>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center space-y-8 bg-background rounded-lg shadow-inner p-8">
                 <Button 
                    onClick={handleMicClick} 
                    disabled={!canSpeak && !isSpeaking} 
                    className={cn(
                        "rounded-full h-28 w-28 transition-all duration-300 transform hover:scale-105 shadow-lg",
                         isSpeaking ? "bg-red-500 hover:bg-red-600" : (canSpeak ? "bg-green-500 hover:bg-green-600" : "bg-muted-foreground cursor-not-allowed")
                    )}
                >
                    {isSpeaking ? <Volume2 className="h-12 w-12 text-white" /> : <Mic className="h-12 w-12 text-white" />}
                </Button>
                 <div className="h-8 text-center">
                    {isSpeaking && <p className='text-lg animate-pulse font-semibold text-red-500'>Listening... (Click to stop)</p>}
                    {room.currentSpeaker && <p className='text-lg animate-pulse font-semibold'>{amISpeaking ? 'Processing...' : `${room.currentSpeaker.userName} is speaking...`}</p>}
                    {!isSpeaking && !room.currentSpeaker && <p className="text-muted-foreground">Press the mic to talk</p>}
                    {!canSpeak && !isSpeaking && !amISpeaking && <p className="text-muted-foreground">Another user is speaking...</p>}
                 </div>
            </div>
        </main>
    </div>
  );
}
