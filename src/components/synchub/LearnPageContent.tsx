
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic, type Phrase } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, Info, LoaderCircle, Award, Star } from 'lucide-react';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateSpeech } from '@/services/tts';
import { assessPronunciationFromMic, abortRecognition } from '@/services/speech';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, writeBatch, serverTimestamp, collection, addDoc, setDoc, increment, runTransaction, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { getAppSettings, type AppSettings } from '@/services/settings';
import type { UserProfile } from '@/app/profile/page';


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
}

interface LearnPageContentProps {
    userProfile: Partial<UserProfile>;
}


export default function LearnPageContent({ userProfile }: LearnPageContentProps) {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const [user] = useAuthState(auth);
    
    const [selectedTopic, setSelectedTopic] = useState<Topic>(phrasebook[0]);
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>('default');
    
    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [phraseAssessments, setPhraseAssessments] = useState<Record<string, AssessmentResult>>({});
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isFetchingSettings, setIsFetchingSettings] = useState(true);

    const practicedPhrasesRef = useRef(new Set<string>());

    // This state is set on mount to avoid hydration errors
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Only run on client
        const savedTopicId = localStorage.getItem('selectedTopicId');
        if (savedTopicId) {
            const savedTopic = phrasebook.find(t => t.id === savedTopicId);
            if (savedTopic) setSelectedTopic(savedTopic);
        }
        const savedVoice = localStorage.getItem('selectedVoice') as VoiceSelection;
        if (['default', 'male', 'female'].includes(savedVoice)) {
            setSelectedVoice(savedVoice);
        }
        
        getAppSettings().then(s => {
            setSettings(s)
            setIsFetchingSettings(false);
        });

    }, []);

    // Effect to handle aborting recognition on component unmount
    useEffect(() => {
        // This is the cleanup function that will run when the component unmounts.
        return () => {
            // If a phrase is being assessed when the component unmounts, abort it.
            // This is the key to preventing the memory leak.
            if (assessingPhraseId) {
                console.log("LearnPageContent unmounting: Aborting recognition.");
                abortRecognition();
            }
        };
    }, [assessingPhraseId]); // This effect depends on the assessingPhraseId
    
    useEffect(() => {
        if (!user && isMounted) {
            try {
                // This logic is for guest users, saving UI state.
                const localData = localStorage.getItem('guestPracticeHistory');
                if (localData) {
                    const parsed: LocalHistory = JSON.parse(localData);
                    setPhraseAssessments(parsed.assessments);
                }
            } catch (error) {
                console.error("Failed to load guest progress from local storage", error);
            }
        }
    }, [user, isMounted]);
    
    useEffect(() => {
        if (!user && isMounted) {
            try {
                 const dataToSave: LocalHistory = { assessments: phraseAssessments };
                 localStorage.setItem('guestPracticeHistory', JSON.stringify(dataToSave));
            } catch (error) {
                console.error("Failed to save guest progress to local storage", error);
            }
        }
    }, [phraseAssessments, user, isMounted]);

    useEffect(() => {
        if (isMounted) {
            localStorage.setItem('selectedTopicId', selectedTopic.id);
        }
    }, [selectedTopic, isMounted]);

    useEffect(() => {
        if (isMounted) {
            localStorage.setItem('selectedVoice', selectedVoice);
        }
    }, [selectedVoice, isMounted]);


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
        } catch (error: any) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Audio Error',
                description: error.message || 'Could not generate audio for the selected language.',
            });
        }
    };
    
    const doAssessPronunciation = async (phrase: Phrase, topicId: string) => {
        if (assessingPhraseId) return;
        if (!user) {
            toast({ variant: 'destructive', title: 'Login Required', description: 'Please log in to save your practice progress.' });
            return;
        }
        if (!settings) {
            toast({ variant: 'destructive', title: 'Loading...', description: 'App settings are still loading. Please try again in a moment.' });
            return;
        }

        const referenceText = getTranslation(phrase, toLanguage);
        const phraseId = phrase.id;
        
        setAssessingPhraseId(phraseId);
    
        try {
            const { practiceReward, practiceThreshold } = settings;
            const assessment = await assessPronunciationFromMic(referenceText, toLanguage);
            const { isPass, accuracy, fluency } = assessment;

            const finalResult: AssessmentResult = { status: isPass ? 'pass' : 'fail', accuracy, fluency };
            setPhraseAssessments(prev => ({...prev, [phraseId]: finalResult}));
            
            await runTransaction(db, async (transaction) => {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await transaction.get(userDocRef);
                if (!userDoc.exists()) throw new Error("User document not found");

                const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
                const historySnap = await transaction.get(historyDocRef);

                const practicedKey = `${phraseId}-${toLanguage}`;
                if (!practicedPhrasesRef.current.has(practicedKey)) {
                        transaction.set(userDocRef, { practiceStats: { byLanguage: { [toLanguage]: { practiced: increment(1) } } } }, { merge: true });
                    practicedPhrasesRef.current.add(practicedKey);
                }

                if (isPass) {
                    const hadPassedBeforeForLang = historySnap.exists() && (historySnap.data()?.passCountPerLang?.[toLanguage] || 0) > 0;
                    
                    if (!hadPassedBeforeForLang) {
                        transaction.set(userDocRef, { practiceStats: { byTopic: { [topicId]: { [toLanguage]: { correct: increment(1) } } }, byLanguage: { [toLanguage]: { correct: increment(1) } } } }, { merge: true });
                    }

                    const passCountForLang = (historySnap.data()?.passCountPerLang?.[toLanguage] || 0) + 1;
                    const historyData = {
                        phraseText: referenceText,
                        [`passCountPerLang.${toLanguage}`]: passCountForLang,
                        [`lastAttemptPerLang.${toLanguage}`]: serverTimestamp(),
                        [`lastAccuracyPerLang.${toLanguage}`]: accuracy
                    };
                    transaction.set(historyDocRef, historyData, { merge: true });

                    if (passCountForLang > 0 && passCountForLang % practiceThreshold === 0) {
                        transaction.update(userDocRef, { tokenBalance: increment(practiceReward) });
                        transaction.set(userDocRef, { practiceStats: { byTopic: { [topicId]: { [toLanguage]: { tokensEarned: increment(practiceReward) } } } } }, { merge: true });
                        
                        const logRef = collection(db, `users/${user.uid}/transactionLogs`);
                        const newLogRef = doc(logRef);
                        transaction.set(newLogRef, { actionType: 'practice_earn', tokenChange: practiceReward, timestamp: serverTimestamp(), description: `Earned for mastering: "${referenceText}" in ${toLanguage}` });
                        
                        toast({ title: "Tokens Earned!", description: `You earned ${practiceReward} token for mastering a phrase!` });
                    }
                }
            });

        } catch (error: any) {
            console.error("[assessPronunciation] Error:", error);
            // Don't show toast if the error is just an abort
            if (error.message !== "Recognition was aborted.") {
                toast({ variant: 'destructive', title: 'Assessment Error', description: error.message || `An unexpected error occurred.`});
            }
        } finally {
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

    const topicStats = userProfile?.practiceStats?.byTopic?.[selectedTopic.id]?.[toLanguage];

    if (!isMounted || isFetchingSettings) {
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
                        <div className="flex items-center justify-center gap-3 rounded-md bg-muted p-1">
                            {phrasebook.map((topic) => (
                                <TooltipProvider key={topic.id} delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setSelectedTopic(topic)}
                                        className={cn(
                                        'h-auto w-auto p-2 transition-all duration-200',
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
                                                <Button size="icon" variant="ghost" onClick={() => doAssessPronunciation(phrase, selectedTopic.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    {isAssessingCurrent ? <LoaderCircle className="h-5 w-5 animate-spin text-red-500" /> : <Mic className="h-5 w-5" />}
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
