
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic, type PracticeHistory } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, XCircle, Info, LoaderCircle } from 'lucide-react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateSpeech } from '@/services/tts';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, writeBatch, serverTimestamp, collection, addDoc, setDoc, increment, getDocs } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { getAppSettings, type AppSettings } from '@/services/settings';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

// Helper function to safely get initial values from localStorage
const getInitialState = <T,>(key: string, fallback: T, validator?: (value: any) => boolean): T => {
    if (typeof window === 'undefined') {
        return fallback;
    }
    try {
        const storedValue = localStorage.getItem(key);
        if (storedValue !== null) {
            // Fix: No need to parse if the stored value is just a string.
            // For voice, it's '"female"', which needs parsing. For topic, it's 'questions', which doesn't.
            // A try-catch block handles both cases gracefully.
            try {
                const parsed = JSON.parse(storedValue);
                 if (validator ? validator(parsed) : true) {
                    return parsed;
                }
            } catch (e) {
                // If parsing fails, it's likely a raw string. Use it directly.
                if (validator ? validator(storedValue) : true) {
                    return storedValue as T;
                }
            }
        }
    } catch (error) {
        console.error(`Error reading from localStorage key "${key}":`, error);
    }
    return fallback;
};


export default function LearnPageContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const [user] = useAuthState(auth);
    
    // State initialization for server/client match
    const [selectedTopic, setSelectedTopic] = useState<Topic>(() => {
        const savedTopicId = getInitialState<string | null>('selectedTopicId', null, (v) => typeof v === 'string');
        return phrasebook.find(t => t.id === savedTopicId) || phrasebook[0];
    });
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>(() => 
        getInitialState<VoiceSelection>('selectedVoice', 'default', (v) => ['default', 'male', 'female'].includes(v))
    );

    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [phraseAssessments, setPhraseAssessments] = useState<Record<string, AssessmentResult>>({});
    const [practiceHistory, setPracticeHistory] = useState<Record<string, PracticeHistory>>({});
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isFetchingHistory, setIsFetchingHistory] = useState(true);

    const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);

    useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);
    
    // Cleanup recognizer on component unmount
    useEffect(() => {
        return () => {
            if (recognizerRef.current) {
                console.log("Component unmounting, closing recognizer.");
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
        }
    }, []);

    // Fetch user-specific progress (or load guest progress) when user status changes.
    useEffect(() => {
        const fetchHistoryAndState = async () => {
            if (user) {
                setIsFetchingHistory(true);
                try {
                    const historyRef = collection(db, 'users', user.uid, 'practiceHistory');
                    const historySnapshot = await getDocs(historyRef);
                    const fetchedHistory: Record<string, PracticeHistory> = {};
                    const fetchedAssessments: Record<string, AssessmentResult> = {};

                    historySnapshot.forEach(doc => {
                        const data = doc.data() as PracticeHistory;
                        fetchedHistory[doc.id] = data;
                        if (data.lastAccuracy !== undefined) {
                            fetchedAssessments[doc.id] = {
                                status: data.lastAccuracy > 70 ? 'pass' : 'fail',
                                accuracy: data.lastAccuracy,
                                fluency: 0
                            };
                        }
                    });
                    
                    setPracticeHistory(fetchedHistory);
                    setPhraseAssessments(fetchedAssessments);

                } catch (error) {
                    console.error("Failed to load practice history from Firestore:", error);
                    toast({ variant: 'destructive', title: 'Error', description: 'Could not load your practice history.' });
                } finally {
                    setIsFetchingHistory(false);
                }
            } else {
                // Logic for logged-out users using localStorage
                try {
                    const savedAssessments = localStorage.getItem('phraseAssessments');
                    if (savedAssessments) setPhraseAssessments(JSON.parse(savedAssessments));
                    const savedHistory = localStorage.getItem('practiceHistory');
                    if (savedHistory) setPracticeHistory(JSON.parse(savedHistory));
                } catch (error) {
                    console.error("Failed to load guest progress from local storage", error);
                }
                setIsFetchingHistory(false);
            }
        };

        fetchHistoryAndState();
    }, [user, toast]);

    // Save progress to localStorage for GUESTS ONLY
    useEffect(() => {
        if (!user) {
            try {
                localStorage.setItem('phraseAssessments', JSON.stringify(phraseAssessments));
                localStorage.setItem('practiceHistory', JSON.stringify(practiceHistory));
            } catch (error) {
                console.error("Failed to save guest progress to local storage", error);
            }
        }
    }, [phraseAssessments, practiceHistory, user]);

    // Save UI state to localStorage for ALL users
    useEffect(() => {
        try {
            // Save as a raw string, not a JSON string
            localStorage.setItem('selectedTopicId', selectedTopic.id);
        } catch (error) {
            console.error("Failed to save topic to local storage", error);
        }
    }, [selectedTopic]);

    useEffect(() => {
        try {
            // Save with JSON.stringify so it's stored as '"female"' etc.
            localStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
        } catch (error) {
            console.error("Failed to save voice to local storage", error);
        }
    }, [selectedVoice]);


    const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
        english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
        malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
        chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
    };

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || !!assessingPhraseId) return;
        const locale = languageToLocaleMap[lang];
        
        try {
            const response = await generateSpeech({ text, lang: locale || 'en-US', voice: selectedVoice });
            const audio = new Audio(response.audioDataUri);
            audio.play().catch(e => console.error("Audio playback failed.", e));
        } catch (error) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Error generating audio',
                description: 'Could not generate audio for the selected language. Credentials might be missing.',
            });
        }
    };
    
   const assessPronunciation = (
    referenceText: string,
    lang: LanguageCode,
    phraseId: string,
  ) => {
    console.log(`[assessPronunciation] Called for phraseId: ${phraseId}`);
    if (recognizerRef.current) {
        console.warn("[assessPronunciation] Recognizer is already active. Ignoring call.");
        return;
    }
    if (!settings) {
        toast({ variant: 'destructive', title: 'Loading...', description: 'App settings are still loading. Please try again in a moment.' });
        return;
    }

    const { practiceReward, practiceThreshold } = settings;
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
      toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
      return;
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) {
      toast({ variant: 'destructive', title: 'Unsupported Language' });
      return;
    }
    
    try {
      console.log("[assessPronunciation] Creating new SpeechRecognizer...");
      const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
      speechConfig.speechRecognitionLanguage = locale;
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      
      const pronunciationConfigJson = JSON.stringify({
          referenceText: `${referenceText}.`,
          gradingSystem: "HundredMark",
          granularity: "Phoneme",
          enableMiscue: true,
      });

      const pronunciationConfig = sdk.PronunciationAssessmentConfig.fromJSON(pronunciationConfigJson);
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      pronunciationConfig.applyTo(recognizer);

      recognizerRef.current = recognizer;

      recognizer.sessionStarted = (s, e) => {
        console.log("[SDK Event] Session Started. Setting assessingPhraseId:", phraseId);
        setAssessingPhraseId(phraseId);
      };
      
      recognizer.sessionStopped = (s, e) => {
        console.log("[SDK Event] Session Stopped.");
        setAssessingPhraseId(null);
        if (recognizerRef.current) {
            console.log("[SDK Event] Closing recognizer instance.");
            recognizerRef.current.close();
            recognizerRef.current = null;
        }
      };

      recognizer.recognized = async (s, e) => {
        console.log("[SDK Event] Speech Recognized.", e);
        if (e.result && e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const jsonString = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
          if (jsonString) {
            const parsedResult = JSON.parse(jsonString);
            const assessment = parsedResult.NBest?.[0]?.PronunciationAssessment;
            if (assessment) {
              const accuracyScore = assessment.AccuracyScore;
              const fluencyScore = assessment.FluencyScore;
              const isPass = accuracyScore > 70;
              
              // Optimistic UI Update
              const finalResult: AssessmentResult = { status: isPass ? 'pass' : 'fail', accuracy: accuracyScore, fluency: fluencyScore };
              const currentHistory = practiceHistory[phraseId] || { passCount: 0, failCount: 0, phraseText: referenceText, lang: toLanguage };
              const newPassCount = currentHistory.passCount + (isPass ? 1 : 0);
              const newHistory: PracticeHistory = {
                 ...currentHistory,
                 passCount: newPassCount,
                 failCount: currentHistory.failCount + (isPass ? 0 : 1),
                 lastAttempt: new Date().toISOString(),
                 lastAccuracy: accuracyScore,
              };
              setPracticeHistory(prev => ({...prev, [phraseId]: newHistory}));
              setPhraseAssessments(prev => ({...prev, [phraseId]: finalResult}));
              
              // Background Firestore Update (for logged-in users)
              if (user) {
                  const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
                  const historyUpdate = {
                      phraseText: referenceText,
                      lang: toLanguage,
                      passCount: increment(isPass ? 1 : 0),
                      failCount: increment(isPass ? 0 : 1),
                      lastAttempt: serverTimestamp(),
                      lastAccuracy: accuracyScore,
                  };
                  await setDoc(historyDocRef, historyUpdate, { merge: true });

                  if (isPass && newPassCount > 0 && newPassCount % practiceThreshold === 0) {
                     try {
                        const userDocRef = doc(db, 'users', user.uid);
                        const logRef = doc(collection(db, `users/${user.uid}/transactionLogs`));
                        const batch = writeBatch(db);
                        
                        batch.update(userDocRef, { tokenBalance: increment(practiceReward) });
                        batch.set(logRef, {
                            actionType: 'practice_earn',
                            tokenChange: practiceReward,
                            timestamp: serverTimestamp(),
                            description: `Earned for mastering: "${referenceText}"`
                        });
                        await batch.commit();
                        toast({ title: "Tokens Earned!", description: `You earned ${practiceReward} token for mastering a phrase!` });
                    } catch(err) {
                        console.error("Token reward transaction failed: ", err);
                        toast({variant: 'destructive', title: 'Transaction Failed', description: 'Could not award tokens.'})
                    }
                  }
              }
            }
          }
        }
      };

      recognizer.canceled = (s, e) => {
          console.error(`[SDK Event] CANCELED: Reason=${e.reason}, Details=${e.errorDetails}`);
          toast({ variant: 'destructive', title: 'Assessment Cancelled', description: `Could not assess pronunciation. Please try again. Reason: ${e.reason}`});
      };

      recognizer.recognizeOnceAsync(
        () => {
            console.log("[assessPronunciation] recognizeOnceAsync call successful.");
        }, 
        (err) => {
           console.error("[assessPronunciation] recognizeOnceAsync call error:", err);
           toast({ variant: 'destructive', title: 'Mic Error', description: `Could not start microphone: ${err}` });
        }
      );

    } catch (error) {
      console.error("[assessPronunciation] Error during assessment setup:", error);
      toast({ variant: 'destructive', title: 'Assessment Error', description: `An unexpected error occurred.`});
      if (recognizerRef.current) {
        recognizerRef.current.close();
        recognizerRef.current = null;
      }
      setAssessingPhraseId(null);
    }
  };
    
    const getTranslation = (textObj: { english: string; translations: Partial<Record<LanguageCode, string>> }, lang: LanguageCode) => {
        if (lang === 'english') {
            return textObj.english;
        }
        return textObj.translations[lang] || textObj.english;
    }
    
    const sortedPhrases = useMemo(() => {
        return [...selectedTopic.phrases];
    }, [selectedTopic]);

    const fromLanguageDetails = languages.find(l => l.value === fromLanguage);
    const toLanguageDetails = languages.find(l => l.value === toLanguage);

    if (isFetchingHistory) {
        return (
            <div className="flex justify-center items-center h-64">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <Card className="shadow-lg mt-6">
            <CardContent className="space-y-6 pt-6">
                 <div className="flex flex-col sm:flex-row items-center gap-2 md:gap-4">
                    <div className="flex-1 w-full">
                        <Label htmlFor="from-language">From</Label>
                        <Select value={fromLanguage} onValueChange={(value) => setFromLanguage(value as LanguageCode)}>
                            <SelectTrigger id="from-language">
                                <SelectValue placeholder="Select a language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map(lang => (
                                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button variant="ghost" size="icon" className="mt-4 sm:mt-5 self-center" onClick={swapLanguages}>
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                        <span className="sr-only">Switch languages</span>
                    </Button>
                    
                    <div className="flex-1 w-full">
                        <Label htmlFor="to-language">To</Label>
                        <Select value={toLanguage} onValueChange={(value) => setToLanguage(value as LanguageCode)}>
                            <SelectTrigger id="to-language">
                                <SelectValue placeholder="Select a language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map(lang => (
                                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-full sm:w-auto sm:flex-1">
                      <Label htmlFor="tts-voice">Voice</Label>
                      <Select value={selectedVoice} onValueChange={(value) => setSelectedVoice(value as VoiceSelection)}>
                          <SelectTrigger id="tts-voice">
                              <SelectValue placeholder="Select a voice" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="default">Default</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                      </Select>
                    </div>
                </div>
            
                <div className="space-y-4 pt-6">
                    <div className="space-y-2">
                         <div className="flex items-center gap-2">
                            <Label htmlFor="topic-select">Select a Topic</Label>
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-5 w-5 text-accent cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs" side="right">
                                        <p className="font-bold text-base mb-2">How to use the Phrasebook:</p>
                                        <ul className="list-disc pl-4 space-y-1 text-sm">
                                            <li>Select a topic to learn relevant phrases.</li>
                                            <li>Click the <Volume2 className="inline-block h-4 w-4 mx-1" /> icon to hear the pronunciation.</li>
                                            <li>Click the <Mic className="inline-block h-4 w-4 mx-1" /> icon to practice your pronunciation. Passing {settings?.practiceThreshold ?? 3} times earns you {settings?.practiceReward ?? 1} token!</li>
                                            { !user && <li className="font-bold">Log in to save your progress permanently!</li> }
                                        </ul>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Select 
                            value={selectedTopic.id} 
                            onValueChange={(value) => {
                                const topic = phrasebook.find(t => t.id === value);
                                if (topic) {
                                    setSelectedTopic(topic);
                                }
                            }}
                        >
                            <SelectTrigger id="topic-select">
                                <SelectValue placeholder="Select a topic" />
                            </SelectTrigger>
                            <SelectContent>
                                {phrasebook.map(topic => (
                                    <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-headline flex items-center gap-3 mb-4 mt-6">
                            <selectedTopic.icon className="h-6 w-6 text-accent" /> 
                            {selectedTopic.title}: {fromLanguageDetails?.label} to {toLanguageDetails?.label}
                        </h3>
                        <div className="space-y-4">
                            {sortedPhrases.map((phrase) => {
                                const fromText = getTranslation(phrase, fromLanguage);
                                const toText = getTranslation(phrase, toLanguage);
                                
                                const fromAnswerText = phrase.answer ? getTranslation(phrase.answer, fromLanguage) : '';
                                const toAnswerText = phrase.answer ? getTranslation(phrase.answer, toLanguage) : '';

                                const assessment = phraseAssessments[phrase.id];
                                const currentPracticeHistory = practiceHistory[phrase.id] || { passCount: 0, failCount: 0 };
                                const isAssessingCurrent = assessingPhraseId === phrase.id;

                                return (
                                <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center w-full">
                                            <div>
                                                <p className="font-semibold text-lg">{fromText}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center w-full">
                                            <div>
                                                <p className="font-bold text-lg text-primary">{toText}</p>
                                                 {assessment && (
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                                                        <div className="flex items-center gap-1">
                                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                            <span className="font-bold">{currentPracticeHistory.passCount}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                             <XCircle className="h-4 w-4 text-red-500" />
                                                            <span className="font-bold">{currentPracticeHistory.failCount}</span>
                                                        </div>
                                                        <p>| Accuracy: <span className="font-bold">{assessment.accuracy?.toFixed(0) ?? 'N/A'}%</span> | Fluency: <span className="font-bold">{assessment.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play audio</span>
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => assessPronunciation(toText, toLanguage, phrase.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Mic className={cn("h-5 w-5", isAssessingCurrent && "text-red-500")} />
                                                    <span className="sr-only">Record pronunciation</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {phrase.answer && (
                                        <>
                                            <div className="border-t border-dashed border-border my-2"></div>
                                            <div className="flex justify-between items-center w-full">
                                                <div>
                                                    <p className="font-semibold text-lg">{fromAnswerText}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center w-full">
                                                <div>
                                                    <p className="font-bold text-lg text-primary">{toAnswerText}</p>
                                                </div>
                                                <div className="flex items-center shrink-0">
                                                    <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toAnswerText, toLanguage)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                        <Volume2 className="h-5 w-5" />
                                                        <span className="sr-only">Play audio</span>
                                                    </Button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}
