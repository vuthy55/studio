
"use client";

import { useState, useMemo, useEffect } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, XCircle, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateSpeech } from '@/services/tts';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { useLanguage } from '@/context/LanguageContext';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, writeBatch, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

type PracticeStats = {
    pass: number;
    fail: number;
}

const PRACTICE_TO_EARN_THRESHOLD = 3;
const PRACTICE_EARN_REWARD = 1;


export default function LearnPageContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const [user] = useAuthState(auth);
    
    // State initialization with lazy loading from localStorage
    const [selectedTopic, setSelectedTopic] = useState<Topic>(() => {
        if (typeof window === 'undefined') return phrasebook[0];
        const savedTopicId = localStorage.getItem('selectedTopicId');
        return phrasebook.find(t => t.id === savedTopicId) || phrasebook[0];
    });
    
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>(() => {
        if (typeof window === 'undefined') return 'default';
        return (localStorage.getItem('selectedVoice') as VoiceSelection) || 'default';
    });

    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [phraseAssessments, setPhraseAssessments] = useState<Record<string, AssessmentResult>>({});
    const [practiceStats, setPracticeStats] = useState<Record<string, PracticeStats>>({});

     // Load progress from local storage on initial mount
    useEffect(() => {
        try {
            const savedAssessments = localStorage.getItem('phraseAssessments');
            if (savedAssessments) {
                setPhraseAssessments(JSON.parse(savedAssessments));
            }
            const savedStats = localStorage.getItem('practiceStats');
            if (savedStats) {
                setPracticeStats(JSON.parse(savedStats));
            }
        } catch (error) {
            console.error("Failed to load progress from local storage", error);
        }
    }, []);

    // Save progress and selections to local storage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('phraseAssessments', JSON.stringify(phraseAssessments));
        } catch (error) {
            console.error("Failed to save assessments to local storage", error);
        }
    }, [phraseAssessments]);

    useEffect(() => {
        try {
            localStorage.setItem('practiceStats', JSON.stringify(practiceStats));
        } catch (error) {
            console.error("Failed to save stats to local storage", error);
        }
    }, [practiceStats]);
    
    useEffect(() => {
        localStorage.setItem('selectedTopicId', selectedTopic.id);
    }, [selectedTopic]);

    useEffect(() => {
        localStorage.setItem('selectedVoice', selectedVoice);
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
    
   const assessPronunciation = async (
    referenceText: string,
    lang: LanguageCode,
    phraseId: string,
  ) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to assess pronunciation.' });
        return;
    }
    const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
    const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;

    if (!azureKey || !azureRegion) {
      toast({
        variant: 'destructive',
        title: 'Configuration Error',
        description: 'Azure credentials are not configured for assessment.',
      });
      return;
    }

    const locale = languageToLocaleMap[lang];
    if (!locale) {
      toast({ variant: 'destructive', title: 'Unsupported Language' });
      return;
    }
    
    setAssessingPhraseId(phraseId);

    let recognizer: sdk.SpeechRecognizer | undefined;
    let finalResult: AssessmentResult = { status: 'fail', accuracy: 0, fluency: 0 };
    
    try {
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
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      pronunciationConfig.applyTo(recognizer);

      const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
        recognizer!.recognizeOnceAsync(resolve, reject);
      });
      
      if (result && result.reason === sdk.ResultReason.RecognizedSpeech) {
        const jsonString = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        
        if (jsonString) {
          const parsedResult = JSON.parse(jsonString);
          const assessment = parsedResult.NBest?.[0]?.PronunciationAssessment;

          if (assessment) {
            const accuracyScore = assessment.AccuracyScore;
            const fluencyScore = assessment.FluencyScore;
            const isPass = accuracyScore > 70;
            finalResult = {
              status: isPass ? 'pass' : 'fail',
              accuracy: accuracyScore,
              fluency: fluencyScore,
            };

            const newStats = {...(practiceStats[phraseId] || { pass: 0, fail: 0 })};
            if(isPass) {
                newStats.pass++;
            } else {
                newStats.fail++;
            }
            setPracticeStats(prev => ({...prev, [phraseId]: newStats}));
            
            if (isPass && newStats.pass > 0 && newStats.pass % PRACTICE_TO_EARN_THRESHOLD === 0) {
                 try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const logRef = doc(collection(db, `users/${user.uid}/transactionLogs`));
                    const batch = writeBatch(db);

                    const userDoc = await getDoc(userDocRef);
                    if (!userDoc.exists()) throw "User document does not exist!";
                    
                    const currentBalance = userDoc.data().tokenBalance || 0;
                    const newBalance = currentBalance + PRACTICE_EARN_REWARD;
                    
                    batch.update(userDocRef, { tokenBalance: newBalance });
                    batch.set(logRef, {
                        actionType: 'practice_earn',
                        tokenChange: PRACTICE_EARN_REWARD,
                        timestamp: serverTimestamp(),
                        description: `Earned for mastering a phrase.`
                    });

                    await batch.commit();

                    toast({ title: "Tokens Earned!", description: `You earned ${PRACTICE_EARN_REWARD} token for mastering a phrase!` });
                } catch(e) {
                    console.error("Token reward transaction failed: ", e);
                    toast({variant: 'destructive', title: 'Transaction Failed', description: 'Could not award tokens.'})
                }
            }
          }
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Assessment Failed',
          description: `Could not assess pronunciation. Please try again. Reason: ${sdk.ResultReason[result.reason]}`,
        });
        finalResult.status = 'fail';
        setPracticeStats(prev => {
            const currentStats = prev[phraseId] || { pass: 0, fail: 0 };
            return { ...prev, [phraseId]: { ...currentStats, fail: currentStats.fail + 1 }};
        });
      }
    } catch (error) {
      console.error("Error during assessment:", error);
      finalResult.status = 'fail';
      setPracticeStats(prev => {
            const currentStats = prev[phraseId] || { pass: 0, fail: 0 };
            return { ...prev, [phraseId]: { ...currentStats, fail: currentStats.fail + 1 }};
      });
      toast({
        variant: 'destructive',
        title: 'Assessment Error',
        description: `An unexpected error occurred during assessment.`,
      });
    } finally {
      if (recognizer) {
        recognizer.close();
      }
      setPhraseAssessments(prev => ({...prev, [phraseId]: finalResult}));
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
                                            <li>Click the <Mic className="inline-block h-4 w-4 mx-1" /> icon to practice your pronunciation. Passing 3 times earns you 1 token!</li>
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
                                const currentPracticeStats = practiceStats[phrase.id] || { pass: 0, fail: 0 };
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
                                                            <span className="font-bold">{currentPracticeStats.pass}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                             <XCircle className="h-4 w-4 text-red-500" />
                                                            <span className="font-bold">{currentPracticeStats.fail}</span>
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
