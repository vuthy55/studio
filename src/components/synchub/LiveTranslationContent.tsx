
"use client";

import { useState, useEffect, useRef } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, LoaderCircle, Bookmark } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { generateSpeech } from '@/services/tts';
import { translateText } from '@/ai/flows/translate-flow';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { useLanguage } from '@/context/LanguageContext';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, runTransaction, addDoc, collection, serverTimestamp, onSnapshot, query } from 'firebase/firestore';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getAppSettings, type AppSettings } from '@/services/settings';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

type SavedPhrase = {
    id: string;
    fromLang: LanguageCode;
    toLang: LanguageCode;
    fromText: string;
    toText: string;
}

interface PracticeHistoryDoc {
    [key: string]: any;
}

interface PracticeHistoryStats {
    [phraseId: string]: {
        passCountPerLang: Record<string, number>;
    }
}


export default function LiveTranslationContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>('default');

    const [isRecognizing, setIsRecognizing] = useState(false);
    const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null);

    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [phraseAssessments, setPhraseAssessments] = useState<Record<string, AssessmentResult>>({});
    const [practiceHistoryStats, setPracticeHistoryStats] = useState<PracticeHistoryStats>({});
    
    const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);
    const [visiblePhraseCount, setVisiblePhraseCount] = useState(3);

    const [user] = useAuthState(auth);
    const [settings, setSettings] = useState<AppSettings | null>(null);

     useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);

    const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
        english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
        malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
        chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
    };

    useEffect(() => {
        try {
            const items = localStorage.getItem('savedPhrases');
            if (items) {
                setSavedPhrases(JSON.parse(items));
            }
        } catch (error) {
            console.error("Failed to load saved phrases from local storage", error);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const historyRef = collection(db, 'users', user.uid, 'practiceHistory');
        const q = query(historyRef);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const stats: PracticeHistoryStats = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data() as PracticeHistoryDoc;
                stats[doc.id] = {
                    passCountPerLang: data.passCountPerLang || {},
                };
            });
            setPracticeHistoryStats(stats);
        }, (error) => {
            console.error("Error listening to practice history:", error);
        });

        // Cleanup listener on component unmount
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        return () => {
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
        };
    }, []);

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || isRecognizing || assessingPhraseId) return;
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
    
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (inputText) {
                handleTranslation();
            } else {
                setTranslatedText('');
            }
        }, 500);

        return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputText, fromLanguage, toLanguage]);


    const handleTranslation = async () => {
        if (!inputText || !user || !settings) {
            if (!user) toast({ variant: 'destructive', title: 'Not Logged In', description: 'Please log in to use translation.' });
            return;
        }

        setIsTranslating(true);
        const translationCost = settings.translationCost;

        try {
            await runTransaction(db, async (transaction) => {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await transaction.get(userDocRef);
                if (!userDoc.exists()) throw "User document does not exist!";
                
                const currentBalance = userDoc.data().tokenBalance || 0;
                if (currentBalance < translationCost) throw "Insufficient tokens for translation.";
                
                const newBalance = currentBalance - translationCost;
                transaction.update(userDocRef, { tokenBalance: newBalance });
                
                const logRef = collection(db, `users/${user.uid}/transactionLogs`);
                addDoc(logRef, {
                    actionType: 'translation_spend',
                    tokenChange: -translationCost,
                    timestamp: serverTimestamp(),
                    description: `Translated: "${inputText}"`
                });
            });

            const fromLangLabel = languages.find(l => l.value === fromLanguage)?.label || fromLanguage;
            const toLangLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
            const result = await translateText({ text: inputText, fromLanguage: fromLangLabel, toLanguage: toLangLabel });
            setTranslatedText(result.translatedText);

        } catch (error: any) {
            console.error('Translation failed', error);
            const errorMessage = typeof error === 'string' ? error : (error.message || 'Could not translate the text.');
            toast({ variant: 'destructive', title: 'Translation Error', description: errorMessage });
            setTranslatedText(''); // Clear previous translation on error
        } finally {
            setIsTranslating(false);
        }
    };

    const recognizeFromMicrophone = async () => {
        if (isRecognizing) return;
        
        const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
        const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    
        if (!azureKey || !azureRegion) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured.' });
            return;
        }

        const locale = languageToLocaleMap[fromLanguage];
        if (!locale) {
            toast({ variant: 'destructive', title: 'Unsupported Language' });
            return;
        }

        setIsRecognizing(true);

        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = locale;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            recognizerRef.current = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizerRef.current!.recognizeOnceAsync(resolve, reject);
            });

            if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                setInputText(result.text);
            } else {
                 toast({ variant: 'destructive', title: 'Recognition Failed', description: `Could not recognize speech. Reason: ${sdk.ResultReason[result.reason]}` });
            }
        } catch (error) {
            console.error("Error during speech recognition:", error);
            toast({ variant: 'destructive', title: 'Recognition Error' });
        } finally {
            if (recognizerRef.current) {
                recognizerRef.current.close();
                recognizerRef.current = null;
            }
            setIsRecognizing(false);
        }
    }

   const assessPronunciation = async (referenceText: string, lang: LanguageCode, phraseId: string) => {
    if (!user || !settings) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to assess pronunciation.' });
        return;
    }
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
            finalResult = { status: isPass ? 'pass' : 'fail', accuracy: accuracyScore, fluency: fluencyScore };
            
            await runTransaction(db, async (transaction) => {
                 const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
                 const historySnap = await transaction.get(historyDocRef);
                 const passCountForLang = (historySnap.data()?.passCountPerLang?.[lang] || 0) + (isPass ? 1 : 0);

                 const historyData = {
                    phraseText: referenceText,
                    [`passCountPerLang.${lang}`]: passCountForLang,
                    [`lastAttemptPerLang.${lang}`]: serverTimestamp(),
                    [`lastAccuracyPerLang.${lang}`]: accuracyScore
                 };
                 transaction.set(historyDocRef, historyData, { merge: true });

                 if (isPass && passCountForLang > 0 && passCountForLang % settings.practiceThreshold === 0) {
                     const userDocRef = doc(db, 'users', user.uid);
                     const userDoc = await transaction.get(userDocRef);
                     if (userDoc.exists()) {
                        transaction.update(userDocRef, { tokenBalance: (userDoc.data().tokenBalance || 0) + settings.practiceReward });
                     }

                     const logRef = collection(db, `users/${user.uid}/transactionLogs`);
                     const newLogRef = doc(logRef);
                     transaction.set(newLogRef, {
                        actionType: 'practice_earn',
                        tokenChange: settings.practiceReward,
                        timestamp: serverTimestamp(),
                        description: `Earned for mastering a saved phrase.`
                    });
                    toast({ title: "Tokens Earned!", description: `You earned ${settings.practiceReward} token!` });
                 }
            });
          }
        }
      } else {
        toast({ variant: 'destructive', title: 'Assessment Failed', description: `Reason: ${sdk.ResultReason[result.reason]}` });
      }
    } catch (error) {
      console.error("Error during assessment:", error);
      toast({ variant: 'destructive', title: 'Assessment Error' });
    } finally {
      if (recognizer) recognizer.close();
      setPhraseAssessments(prev => ({...prev, [phraseId]: finalResult}));
      setAssessingPhraseId(null);
    }
  };

    const handleSavePhrase = () => {
        if (!inputText || !translatedText) return;

        const newPhrase: SavedPhrase = {
            id: `saved_${new Date().getTime()}`,
            fromLang: fromLanguage,
            toLang: toLanguage,
            fromText: inputText,
            toText: translatedText,
        };
        
        const isDuplicate = savedPhrases.some(p => p.fromText === newPhrase.fromText && p.toText === newPhrase.toText);
        if (isDuplicate) {
            toast({ variant: "default", title: "Already Saved", description: "This phrase is already in your practice list." });
            return;
        }

        const updatedPhrases = [newPhrase, ...savedPhrases];
        setSavedPhrases(updatedPhrases);
        localStorage.setItem('savedPhrases', JSON.stringify(updatedPhrases));
        toast({ title: "Phrase Saved", description: "Added to your practice list below." });
    };

    return (
        <div className="space-y-8">
            <Card className="shadow-lg">
                <CardContent className="space-y-6 pt-6">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-4 mb-6">
                        <div className="flex-1 w-full">
                            <Label htmlFor="from-language-select-live">From</Label>
                            <Select value={fromLanguage} onValueChange={(value) => setFromLanguage(value as LanguageCode)}>
                                <SelectTrigger id="from-language-select-live">
                                    <SelectValue placeholder="Select a language" />
                                </SelectTrigger>
                                <SelectContent>
                                    {languages.map(lang => (
                                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button variant="ghost" size="icon" className="self-end" onClick={swapLanguages}>
                            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                            <span className="sr-only">Switch languages</span>
                        </Button>
                        
                        <div className="flex-1 w-full">
                            <Label htmlFor="to-language-select-live">To</Label>
                            <Select value={toLanguage} onValueChange={(value) => setToLanguage(value as LanguageCode)}>
                                <SelectTrigger id="to-language-select-live">
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
                        <Label htmlFor="tts-voice-live">Voice</Label>
                        <Select value={selectedVoice} onValueChange={(value) => setSelectedVoice(value as VoiceSelection)}>
                            <SelectTrigger id="tts-voice-live">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="from-language-live">{languages.find(l => l.value === fromLanguage)?.label}</Label>
                                <Button size="icon" variant="ghost" onClick={recognizeFromMicrophone} disabled={isRecognizing || !!assessingPhraseId}>
                                    {isRecognizing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                    <span className="sr-only">Record from microphone</span>
                                </Button>
                            </div>
                            <Textarea
                                id="from-language-live"
                                placeholder="Type or speak..."
                                className="h-36 resize-none"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                            <Label htmlFor="to-language-live">{languages.find(l => l.value === toLanguage)?.label} (Cost: {settings?.translationCost || 1} Token)</Label>
                            <div className="flex items-center">
                                    <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translatedText, toLanguage)} disabled={!translatedText || !!assessingPhraseId}>
                                        <Volume2 className="h-5 w-5" />
                                        <span className="sr-only">Play translated audio</span>
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={handleSavePhrase} disabled={!translatedText}>
                                        <Bookmark className="h-5 w-5" />
                                        <span className="sr-only">Save for practice</span>
                                    </Button>
                            </div>
                            </div>
                            <div className="h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-base relative">
                                {isTranslating && <LoaderCircle className="absolute top-3 right-3 h-5 w-5 animate-spin text-muted-foreground" />}
                                <p>{translatedText}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {savedPhrases.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold font-headline">Your Saved Phrases</h3>
                    <Accordion type="multiple" className="w-full">
                        {savedPhrases.slice(0, visiblePhraseCount).map(phrase => {
                            const assessment = phraseAssessments[phrase.id];
                            const passes = practiceHistoryStats[phrase.id]?.passCountPerLang?.[phrase.toLang] || 0;
                            const isAssessingCurrent = assessingPhraseId === phrase.id;
                            
                            return (
                                <AccordionItem value={phrase.id} key={phrase.id}>
                                    <AccordionTrigger>
                                        <div className="flex flex-col text-left">
                                            <span className="text-muted-foreground">{phrase.fromText}</span>
                                            <span className="font-semibold text-primary">{phrase.toText}</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="flex justify-between items-center w-full px-4 pb-2">
                                            <div className="text-xs text-muted-foreground flex items-center gap-4">
                                                <div className="flex items-center gap-1" title='Correct attempts'>
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    <span className="font-bold">{passes}</span>
                                                </div>
                                                {assessment && (
                                                     <p>| Accuracy: <span className="font-bold">{assessment.accuracy?.toFixed(0) ?? 'N/A'}%</span></p>
                                                )}
                                            </div>
                                            <div className="flex items-center shrink-0 ml-auto">
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(phrase.toText, phrase.toLang)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Volume2 className="h-5 w-5" /><span className="sr-only">Play</span>
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => assessPronunciation(phrase.toText, phrase.toLang, phrase.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    {isAssessingCurrent ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                                    <span className="sr-only">Practice</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })}
                    </Accordion>
                    {savedPhrases.length > visiblePhraseCount && (
                        <div className="text-center">
                            <Button variant="outline" onClick={() => setVisiblePhraseCount(prev => prev + 3)}>Load More</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
