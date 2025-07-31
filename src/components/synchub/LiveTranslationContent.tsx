
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { languages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, LoaderCircle, Bookmark, XCircle, Award, Trash2, HelpCircle, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import useLocalStorage from '@/hooks/use-local-storage';
import { useUserData } from '@/context/UserDataContext';
import { cn } from '@/lib/utils';
import type { SavedPhrase } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { languageToLocaleMap } from '@/lib/utils';
import type { AzureLanguageCode } from '@/lib/azure-languages';
import { recognizeFromMic, abortRecognition, assessPronunciationFromMic } from '@/services/speech';
import { azureLanguages } from '@/lib/azure-languages';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';
import { useTour, TourStep } from '@/context/TourContext';
import { openDB } from 'idb';
import type { AudioPack } from '@/lib/types';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentResult = {
  status: 'pass' | 'fail';
  accuracy?: number;
  fluency?: number;
};

const liveTranslationTourSteps: TourStep[] = [
  {
    selector: '[data-tour="lt-language-selectors"]',
    content: "First, select the language you want to translate FROM and TO. You can swap them with the arrow button.",
  },
  {
    selector: '[data-tour="lt-input-textarea"]',
    content: "Type the text you want to translate into this box. The translation will appear on the right automatically.",
    position: 'bottom',

  },
  {
    selector: '[data-tour="lt-mic-button"]',
    content: "Alternatively, click the microphone to speak. The app will transcribe your speech into the text box for you.",
    position: 'bottom',

  },
   {
    selector: '[data-tour="lt-output-actions"]',
    content: "Once you have a translation, you can listen to its pronunciation with the speaker icon, or save it for later practice with the bookmark icon.",
    position: 'bottom',

  },
  {
    selector: '[data-tour="lt-saved-phrases"]',
    content: "Your saved phrases will appear here. You can practice your pronunciation, get feedback, and earn tokens for correct attempts, just like in the 'Prep Your Vibe' section.",
    position: 'top',
  },
];

async function getDb() {
  return openDB('VibeSync-Offline', 2);
}

export default function LiveTranslationContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const { user, userProfile, practiceHistory, settings, recordPracticeAttempt, spendTokensForTranslation, offlineAudioPacks } = useUserData();
    
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedVoice, setSelectedVoice] = useLocalStorage<VoiceSelection>('selectedVoice', 'default');

    const [isRecognizing, setIsRecognizing] = useState(false);

    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [lastAssessment, setLastAssessment] = useState<Record<string, AssessmentResult>>({});
    
    const [savedPhrases, setSavedPhrases] = useLocalStorage<SavedPhrase[]>('savedPhrases', []);
    const [visiblePhraseCount, setVisiblePhraseCount] = useState(3);
    
    const [isOnline, setIsOnline] = useState(true);

    const { startTour } = useTour();

    const availableLanguages = useMemo(() => {
        if (!userProfile?.unlockedLanguages) return languages.filter(l => l.value === 'english');
        return languages.filter(l => userProfile.unlockedLanguages?.includes(l.value));
    }, [userProfile?.unlockedLanguages]);

    const azureFromLanguage = useMemo(() => {
        const locale = languageToLocaleMap[fromLanguage];
        if (locale) {
            // Find the first Azure language that matches the simple locale prefix
            return azureLanguages.find(az => az.value.startsWith(locale.split('-')[0]))?.value || 'en-US';
        }
        return 'en-US';
    }, [fromLanguage]);


    useEffect(() => {
        // If the current 'from' or 'to' language is not in the available list, reset it.
        if (!availableLanguages.some(l => l.value === fromLanguage)) {
            setFromLanguage(availableLanguages[0]?.value || 'english');
        }
        if (!availableLanguages.some(l => l.value === toLanguage)) {
            setToLanguage(availableLanguages[1]?.value || availableLanguages[0]?.value || 'english');
        }
    }, [availableLanguages, fromLanguage, toLanguage, setFromLanguage, setToLanguage]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        if (typeof window !== 'undefined') {
            setIsOnline(navigator.onLine);
        }

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Effect to handle aborting recognition on component unmount
    useEffect(() => {
        return () => {
            if (isRecognizing || assessingPhraseId) {
                abortRecognition();
            }
        };
    }, [isRecognizing, assessingPhraseId]);


    const handlePlayAudio = async (text: string, lang: LanguageCode, phraseId: string) => {
        if (!text || isRecognizing || assessingPhraseId) return;

        const db = await getDb();
        const savedAudioPack = await db.get('AudioPacks', 'user_saved_phrases') as AudioPack | undefined;
        const audioDataUri = savedAudioPack?.[phraseId];
        
        if (audioDataUri) {
            const audio = new Audio(audioDataUri);
            audio.play().catch(e => console.error("Offline audio playback failed.", e));
            return;
        }

        if (!isOnline) {
            toast({ variant: 'destructive', title: 'Audio Unavailable Offline', description: 'This specific audio has not been saved for offline use.' });
            return;
        }
        
        const locale = languageToLocaleMap[lang];
        try {
            const response = await generateSpeech({ text, lang: locale || 'en-US', voice: selectedVoice });
            const audio = new Audio(response.audioDataUri);
            audio.play().catch(e => console.error("Online audio playback failed.", e));
        } catch (error: any) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Audio Error',
                description: error.message || 'Could not generate audio for the selected language.',
            });
        }
    };
    
    const handleTranslation = async () => {
        if (!inputText.trim()) return;

        if (!isOnline) {
            toast({ variant: 'destructive', title: 'Offline', description: 'Translation services require an internet connection.' });
            setTranslatedText('');
            return;
        }

        if (!user || !settings) {
            if (!user) toast({ variant: 'destructive', title: 'Not Logged In', description: 'Please log in to use translation.' });
            setTranslatedText('');
            return;
        }

        setIsTranslating(true);
        try {
            const description = `Translated: "${inputText.substring(0, 50)}..."`;
            
            const spendSuccess = spendTokensForTranslation(description);
            
            if (!spendSuccess) {
                toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You do not have enough tokens for this translation.' });
                setTranslatedText('');
                setIsTranslating(false);
                return;
            }
            
            const fromLangLabel = languages.find(l => l.value === fromLanguage)?.label || fromLanguage;
            const toLangLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
            
            const result = await translateText({ text: inputText, fromLanguage: fromLangLabel, toLanguage: toLangLabel });
            
            setTranslatedText(result.translatedText);

        } catch (error: any) {
            const errorMessage = typeof error === 'string' ? error : (error.message || 'Could not translate the text.');
            toast({ variant: 'destructive', title: 'Translation Error', description: errorMessage });
            setTranslatedText(''); // Clear translation on error
        } finally {
            setIsTranslating(false);
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

        return () => {
            clearTimeout(debounceTimer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputText, fromLanguage, toLanguage, isOnline]);

    const doRecognizeFromMicrophone = async () => {
        if (isRecognizing || assessingPhraseId) return;
        
        setIsRecognizing(true);
        try {
            const resultText = await recognizeFromMic(azureFromLanguage as AzureLanguageCode);
            if (resultText) {
                setInputText(resultText);
            }
        } catch (error: any) {
             if (error.message !== "Recognition was aborted.") {
               toast({ variant: 'destructive', title: 'Recognition Failed', description: error.message });
            }
        } finally {
            setIsRecognizing(false);
        }
    }

   const doAssessPronunciation = async (phrase: SavedPhrase) => {
    if (assessingPhraseId) return;
    if (!user) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'Please log in to save your practice progress.' });
        return;
    }
    if (!settings) {
        toast({ variant: 'destructive', title: 'Loading...', description: 'App settings are still loading. Please try again in a moment.' });
        return;
    }

    const { id: phraseId, toText: referenceText, toLang } = phrase;
    
    setAssessingPhraseId(phraseId);
    setLastAssessment(prev => ({ ...prev, [phraseId]: undefined } as any));

    try {
        const assessment = await assessPronunciationFromMic(referenceText, toLang);
        const { isPass, accuracy, fluency } = assessment;

        const finalResult: AssessmentResult = { status: isPass ? 'pass' : 'fail', accuracy, fluency };
        setLastAssessment(prev => ({ ...prev, [phraseId]: finalResult }));
        
        const { wasRewardable, rewardAmount } = recordPracticeAttempt({
            phraseId,
            topicId: 'live_translation_saved',
            lang: toLang,
            isPass,
            accuracy,
        });

        if (wasRewardable) {
            toast({ 
                title: "Congratulations!",
                description: (
                    <div className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-amber-500" />
                        <span>You earned {rewardAmount} tokens!</span>
                    </div>
                )
            });
        }

    } catch (error: any) {
        if (error.message !== "Recognition was aborted.") {
            toast({ variant: 'destructive', title: 'Assessment Error', description: error.message || `An unexpected error occurred.`});
        }
    } finally {
        setAssessingPhraseId(null);
    }
  };

    const handleSavePhrase = async () => {
        if (!inputText || !translatedText || !user || !settings) return;

        const isDuplicate = savedPhrases.some(p => p.fromText === inputText && p.toText === translatedText);
        if (isDuplicate) {
            toast({ variant: "default", title: "Already Saved", description: "This phrase is already in your practice list." });
            return;
        }

        setIsSaving(true);
        try {
            // 1. Generate audio first
            const toLocale = languageToLocaleMap[toLanguage];
            if (!toLocale) throw new Error("Unsupported language for audio generation.");
            const { audioDataUri } = await generateSpeech({ text: translatedText, lang: toLocale, voice: selectedVoice });

            // 2. Charge user only on successful audio generation
            const description = `Saved phrase for offline: "${inputText.substring(0, 30)}..."`;
            const spendSuccess = spendTokensForTranslation(description);

            if (!spendSuccess) {
                toast({ variant: 'destructive', title: 'Insufficient Tokens', description: 'You do not have enough tokens to save this phrase.' });
                setIsSaving(false);
                return;
            }

            // 3. Save text and audio locally
            const newPhrase: SavedPhrase = {
                id: `saved_${new Date().getTime()}`,
                fromLang: fromLanguage,
                toLang: toLanguage,
                fromText: inputText,
                toText: translatedText,
            };

            const db = await getDb();
            const tx = db.transaction('AudioPacks', 'readwrite');
            const store = tx.objectStore('AudioPacks');
            let audioPack = await store.get('user_saved_phrases') as AudioPack | undefined;
            if (!audioPack) audioPack = {};
            audioPack[newPhrase.id] = audioDataUri;
            await store.put(audioPack, 'user_saved_phrases');
            await tx.done;

            setSavedPhrases([newPhrase, ...savedPhrases]);
            toast({ title: "Phrase Saved Offline", description: "Audio is now available for offline practice." });
            
        } catch (error: any) {
            console.error("Error saving phrase:", error);
            toast({ variant: "destructive", title: "Save Failed", description: error.message || "Could not save the phrase and its audio." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemovePhrase = async (idToRemove: string) => {
        setSavedPhrases(savedPhrases.filter(p => p.id !== idToRemove));
        
        try {
            const db = await getDb();
            const tx = db.transaction('AudioPacks', 'readwrite');
            const store = tx.objectStore('AudioPacks');
            const audioPack = await store.get('user_saved_phrases') as AudioPack | undefined;
            if (audioPack && audioPack[idToRemove]) {
                delete audioPack[idToRemove];
                await store.put(audioPack, 'user_saved_phrases');
            }
            await tx.done;
            toast({ title: "Phrase Removed", description: "Removed from your practice list." });
        } catch (error) {
            console.error("Error removing audio from IndexedDB:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not remove offline audio." });
        }
    }

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Live Translation
                    </CardTitle>
                    <CardDescription>
                        A simple utility for translating typed or spoken text from a source to a target language.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex flex-col items-center gap-4 text-center">
                        <Button onClick={() => startTour(liveTranslationTourSteps)} size="lg">
                            <HelpCircle className="mr-2" />
                            Take a Tour
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardContent className="space-y-6 pt-6">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-4 mb-6" data-tour="lt-language-selectors">
                        <div className="flex-1 w-full">
                            <Label htmlFor="from-language-select-live">From</Label>
                            <Select value={fromLanguage} onValueChange={(value) => setFromLanguage(value as LanguageCode)}>
                                <SelectTrigger id="from-language-select-live">
                                    <SelectValue placeholder="Select a language" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableLanguages.map(lang => (
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
                                    {availableLanguages.map(lang => (
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
                        <div className="space-y-2" data-tour="lt-input-textarea">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="from-language-live">{languages.find(l => l.value === fromLanguage)?.label}</Label>
                                <div className="flex items-center">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <Button size="icon" variant="ghost" onClick={() => setInputText('')} disabled={!inputText}>
                                                    <X className="h-5 w-5 text-muted-foreground" />
                                                    <span className="sr-only">Clear text</span>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Clear text</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <div className="relative" data-tour="lt-mic-button">
                                                    <Button size="icon" variant="ghost" onClick={doRecognizeFromMicrophone} disabled={!isOnline || isRecognizing || !!assessingPhraseId}>
                                                        {isRecognizing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                                        <span className="sr-only">Record from microphone</span>
                                                    </Button>
                                                 </div>
                                            </TooltipTrigger>
                                            {!isOnline && (
                                                <TooltipContent>
                                                    <p>Voice input is disabled while offline.</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>
                            <Textarea
                                id="from-language-live"
                                placeholder="Type or speak..."
                                className="h-36 resize-none"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                        </div>
                        
                        <div className="space-y-2" data-tour="lt-output-textarea">
                            <div className="flex justify-between items-center">
                            <Label htmlFor="to-language-live" className="text-sm">
                                {languages.find(l => l.value === toLanguage)?.label} 
                                {user && (
                                     <span className="text-muted-foreground"> (Cost: {settings?.translationCost || '...'} / Bal: {userProfile?.tokenBalance ?? '...'})</span>
                                )}
                            </Label>
                            <div className="flex items-center" data-tour="lt-output-actions">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translatedText, toLanguage, '')} disabled={!translatedText || !!assessingPhraseId}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play translated audio</span>
                                                </Button>
                                            </TooltipTrigger>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <Button size="icon" variant="ghost" onClick={handleSavePhrase} disabled={!translatedText || isSaving}>
                                        {isSaving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Bookmark className="h-5 w-5" />}
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

            {savedPhrases.length > 0 && user && (
                <div className="space-y-4" data-tour="lt-saved-phrases">
                    <h3 id="saved-phrases" className="text-xl font-bold font-headline scroll-mt-20">Your Saved Phrases for Practice</h3>
                    <div className="w-full space-y-2">
                        {savedPhrases.slice(0, visiblePhraseCount).map(phrase => {
                            const assessment = lastAssessment[phrase.id];
                            const history = practiceHistory[phrase.id];
                            const passes = history?.passCountPerLang?.[phrase.toLang] || 0;
                            const fails = history?.failCountPerLang?.[phrase.toLang] || 0;
                            const isAssessingCurrent = assessingPhraseId === phrase.id;
                            const hasBeenRewarded = settings && passes >= settings.practiceThreshold;

                            const getResultIcon = () => {
                                if (!assessment) return null;
                                if (assessment.status === 'pass') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
                                if (assessment.status === 'fail') return <XCircle className="h-5 w-5 text-red-500" />;
                                return null;
                            };

                            return (
                                <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                    <p className="font-semibold text-lg">{phrase.fromText}</p>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center w-full">
                                            <div>
                                                <p className="font-bold text-lg text-primary">{phrase.toText}</p>
                                                {assessment && (
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                                                        <p>Accuracy: <span className="font-bold">{assessment.accuracy?.toFixed(0) ?? 'N/A'}%</span></p>
                                                        <p>Fluency: <span className="font-bold">{assessment.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                {getResultIcon()}
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(phrase.toText, phrase.toLang, phrase.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                                <Volume2 className="h-5 w-5" /><span className="sr-only">Play</span>
                                                            </Button>
                                                        </TooltipTrigger>
                                                    </Tooltip>
                                                </TooltipProvider>

                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="relative">
                                                                <Button size="icon" variant="ghost" onClick={() => doAssessPronunciation(phrase)} disabled={!isOnline || isAssessingCurrent || !!assessingPhraseId}>
                                                                    {isAssessingCurrent ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                                                    <span className="sr-only">Practice</span>
                                                                </Button>
                                                             </div>
                                                        </TooltipTrigger>
                                                         {!isOnline && (
                                                            <TooltipContent>
                                                                <p>Practice is disabled while offline.</p>
                                                            </TooltipContent>
                                                        )}
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <Button size="icon" variant="ghost" onClick={() => handleRemovePhrase(phrase.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Trash2 className="h-5 w-5 text-red-500" /><span className="sr-only">Remove</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    {(passes > 0 || fails > 0) &&
                                        <div className="text-xs text-muted-foreground flex items-center gap-4 border-t pt-2">
                                            {hasBeenRewarded && (
                                                <div className="flex items-center gap-1 text-amber-500 font-bold" title={`Tokens awarded for this phrase: +${settings?.practiceReward || 0}`}>
                                                    <Award className="h-4 w-4" />
                                                    <span>+{settings?.practiceReward || 0}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1" title='Correct attempts'>
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                <span className="font-bold">{passes}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title='Incorrect attempts'>
                                                <XCircle className="h-4 w-4 text-red-500" />
                                                <span className="font-bold">{fails}</span>
                                            </div>
                                        </div>
                                    }
                                </div>
                            )
                        })}
                    </div>
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
