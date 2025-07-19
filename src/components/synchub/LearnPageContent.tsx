
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic, type PracticeHistory as LocalPracticeHistory, type Phrase } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, XCircle, Info, LoaderCircle, Award, Star } from 'lucide-react';
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
import { doc, getDoc, writeBatch, serverTimestamp, collection, addDoc, setDoc, increment, getDocs, onSnapshot, FieldValue } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { getAppSettings, type AppSettings } from '@/services/settings';
import type { UserProfile, PracticeStats } from '@/app/profile/page';


type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

// This is for guest users in local storage
type LocalHistory = {
    assessments: Record<string, AssessmentResult>;
    history: Record<string, LocalPracticeHistory>;
}


// Helper function to safely get initial values from localStorage
const getInitialState = <T,>(key: string, fallback: T, validator?: (value: any) => boolean): T => {
    if (typeof window === 'undefined') {
        return fallback;
    }
    try {
        const storedValue = localStorage.getItem(key);
        if (storedValue !== null) {
            // A try-catch block handles both raw strings and JSON strings gracefully.
            try {
                 // The value for topic is a raw string, not JSON, so we shouldn't parse it.
                if (key === 'selectedTopicId') {
                    if (validator ? validator(storedValue) : true) {
                        return storedValue as unknown as T;
                    }
                }
                const parsed = JSON.parse(storedValue);
                 if (validator ? validator(parsed) : true) {
                    return parsed;
                }
            } catch (e) {
                // If parsing fails, it's likely a raw string. Use it directly.
                if (validator ? validator(storedValue) : true) {
                    return storedValue as unknown as T;
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
    const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({});
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isFetchingHistory, setIsFetchingHistory] = useState(true);

    const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);
    
    // This ref will store which phrases have been practiced in the current session
    // to avoid incrementing the 'practiced' stat multiple times.
    const practicedPhrasesRef = useRef(new Set<string>());

    useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);
    
    // Cleanup recognizer on component unmount
    useEffect(() => {
        return () => {
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
        }
    }, []);

    // Fetch user-specific profile and progress when user status changes.
    useEffect(() => {
        if (user) {
            setIsFetchingHistory(true);
            const userDocRef = doc(db, 'users', user.uid);
            const unsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    setUserProfile(doc.data());
                }
                setIsFetchingHistory(false);
            }, (error) => {
                console.error("Failed to listen to user profile:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load your profile data.' });
                setIsFetchingHistory(false);
            });
            return () => unsubscribe();
        } else {
            // Logic for logged-out users using localStorage
            try {
                const localData = localStorage.getItem('guestPracticeHistory');
                if (localData) {
                    const parsed: LocalHistory = JSON.parse(localData);
                    setPhraseAssessments(parsed.assessments);
                }
            } catch (error) {
                console.error("Failed to load guest progress from local storage", error);
            }
            setIsFetchingHistory(false);
        }
    }, [user, toast]);
    

    // Save progress to localStorage for GUESTS ONLY
    useEffect(() => {
        if (!user) {
            try {
                // This logic needs to be updated if guests need stats
                // For now, it only saves assessment UI state
            } catch (error) {
                console.error("Failed to save guest progress to local storage", error);
            }
        }
    }, [phraseAssessments, user]);

    // Save UI state to localStorage for ALL users
    useEffect(() => {
        try {
            localStorage.setItem('selectedTopicId', selectedTopic.id);
        } catch (error) {
            console.error("Failed to save topic to local storage", error);
        }
    }, [selectedTopic]);

    useEffect(() => {
        try {
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
    
    const assessPronunciation = async (phrase: Phrase, topicId: string) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Login Required', description: 'Please log in to save your practice progress.' });
            return;
        }
        if (recognizerRef.current) return;
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

        const referenceText = getTranslation(phrase, toLanguage);
        const phraseId = phrase.id;
        const locale = languageToLocaleMap[toLanguage];
        if (!locale) {
            toast({ variant: 'destructive', title: 'Unsupported Language' });
            return;
        }
    
        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = locale;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            const pronunciationConfig = sdk.PronunciationAssessmentConfig.fromJSON(JSON.stringify({ referenceText: `${referenceText}.`, gradingSystem: "HundredMark", granularity: "Phoneme", enableMiscue: true }));
            const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
            pronunciationConfig.applyTo(recognizer);
            recognizerRef.current = recognizer;

            recognizer.sessionStarted = () => setAssessingPhraseId(phraseId);
            recognizer.sessionStopped = () => {
                setAssessingPhraseId(null);
                if (recognizerRef.current) {
                    recognizerRef.current.close();
                    recognizerRef.current = null;
                }
            };

            recognizer.recognized = async (s, e) => {
                if (e.result && e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                    const jsonString = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
                    if (!jsonString) return;

                    const assessment = JSON.parse(jsonString).NBest?.[0]?.PronunciationAssessment;
                    if (!assessment) return;

                    const accuracyScore = assessment.AccuracyScore;
                    const isPass = accuracyScore > 70;
                    
                    const finalResult: AssessmentResult = { status: isPass ? 'pass' : 'fail', accuracy: accuracyScore, fluency: assessment.FluencyScore };
                    setPhraseAssessments(prev => ({...prev, [phraseId]: finalResult}));
                    
                    const userDocRef = doc(db, 'users', user.uid);
                    const batch = writeBatch(db);

                    const practiceKey = `${phraseId}-${toLanguage}`;
                    const hasPracticedBefore = practicedPhrasesRef.current.has(practiceKey);
                    if (!hasPracticedBefore) {
                        batch.set(userDocRef, { practiceStats: { byLanguage: { [toLanguage]: { practiced: increment(1) } } } }, { merge: true });
                        practicedPhrasesRef.current.add(practiceKey);
                    }
                    
                    const stats = userProfile.practiceStats;
                    const hadPassedBefore = (stats?.byTopic?.[topicId]?.correct ?? 0) > 0;
                    
                    if (isPass && !hadPassedBefore) {
                        batch.set(userDocRef, { practiceStats: { byTopic: { [topicId]: { correct: increment(1) } }, byLanguage: { [toLanguage]: { correct: increment(1) } } } }, { merge: true });
                    }
                    
                    if (isPass) {
                        const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
                        const historySnap = await getDoc(historyDocRef);
                        const passCount = (historySnap.data()?.passCount || 0) + 1;
                        batch.set(historyDocRef, { phraseText: referenceText, lang: toLanguage, passCount: increment(1), lastAttempt: serverTimestamp(), lastAccuracy: accuracyScore }, { merge: true });

                        if (passCount > 0 && passCount % practiceThreshold === 0) {
                            batch.update(userDocRef, { tokenBalance: increment(practiceReward) });
                            batch.set(userDocRef, { practiceStats: { byTopic: { [topicId]: { tokensEarned: increment(practiceReward) } } } }, { merge: true });
                            const logRef = collection(db, `users/${user.uid}/transactionLogs`);
                            addDoc(logRef, { actionType: 'practice_earn', tokenChange: practiceReward, timestamp: serverTimestamp(), description: `Earned for mastering: "${referenceText}"` });
                            toast({ title: "Tokens Earned!", description: `You earned ${practiceReward} token for mastering a phrase!` });
                        }
                    }

                    await batch.commit();
                }
            };

            recognizer.canceled = (s, e) => {
                toast({ variant: 'destructive', title: 'Assessment Cancelled', description: `Could not assess pronunciation. Please try again. Reason: ${e.reason}`});
            };

            recognizer.recognizeOnceAsync();

        } catch (error) {
            console.error("[assessPronunciation] Error:", error);
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

    const topicStats = userProfile.practiceStats?.byTopic?.[selectedTopic.id];

    if (isFetchingHistory && user) {
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
                            <Label>Select a Topic</Label>
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
                        <div className="flex justify-center items-center gap-3 bg-muted p-1 rounded-md">
                            {phrasebook.map(topic => (
                                <TooltipProvider key={topic.id} delayDuration={100}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                onClick={() => setSelectedTopic(topic)}
                                                className={cn(
                                                    "h-auto w-auto p-2 transition-colors duration-200",
                                                    selectedTopic.id === topic.id
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                                                )}
                                            >
                                                <topic.icon className="h-12 w-12" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{topic.title}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-headline flex items-center gap-3 mb-1 mt-6">
                            <selectedTopic.icon className="h-6 w-6 text-accent" /> 
                            {selectedTopic.title}: {fromLanguageDetails?.label} to {toLanguageDetails?.label}
                        </h3>
                        {user && (
                            <div className="text-sm text-muted-foreground mb-4 flex items-center gap-4">
                                <div className="flex items-center gap-1.5" title="Unique phrases pronounced correctly">
                                    <Star className="h-4 w-4 text-yellow-500" />
                                    <span>Correct: <strong>{topicStats?.correct ?? 0} / {selectedTopic.phrases.length}</strong></span>
                                </div>
                                <div className="flex items-center gap-1.5" title="Tokens earned from this topic">
                                    <Award className="h-4 w-4 text-amber-500" />
                                    <span>Tokens Earned: <strong>{topicStats?.tokensEarned ?? 0}</strong></span>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {sortedPhrases.map((phrase) => {
                                const fromText = getTranslation(phrase, fromLanguage);
                                const toText = getTranslation(phrase, toLanguage);
                                const fromAnswerText = phrase.answer ? getTranslation(phrase.answer, fromLanguage) : '';
                                const toAnswerText = phrase.answer ? getTranslation(phrase.answer, toLanguage) : '';

                                const assessment = phraseAssessments[phrase.id];
                                const isAssessingCurrent = assessingPhraseId === phrase.id;

                                return (
                                <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center w-full">
                                            <p className="font-semibold text-lg">{fromText}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center w-full">
                                            <div>
                                                <p className="font-bold text-lg text-primary">{toText}</p>
                                                 {assessment && (
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                                                        <p>Accuracy: <span className="font-bold">{assessment.accuracy?.toFixed(0) ?? 'N/A'}%</span></p>
                                                        <p>Fluency: <span className="font-bold">{assessment.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play audio</span>
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => assessPronunciation(phrase, selectedTopic.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Mic className={cn("h-5 w-5", isAssessingCurrent && "text-red-500")} />
                                                    <span className="sr-only">Record pronunciation</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {phrase.answer && (
                                        <>
                                            <div className="border-t border-dashed border-border my-2"></div>
                                            <p className="font-semibold text-lg">{fromAnswerText}</p>
                                            <div className="flex justify-between items-center w-full">
                                                <p className="font-bold text-lg text-primary">{toAnswerText}</p>
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
