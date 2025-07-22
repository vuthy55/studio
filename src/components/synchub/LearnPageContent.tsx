
"use client";

import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic, type Phrase } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, Info, LoaderCircle, Award, Star, CheckCircle2, XCircle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { getAppSettings, type AppSettings } from '@/services/settings';
import useLocalStorage from '@/hooks/use-local-storage';
import { useUserData } from '@/context/UserDataContext';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentResult = {
  status: 'pass' | 'fail';
  accuracy?: number;
  fluency?: number;
};

function LearnPageContent() {
    const { fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages } = useLanguage();
    const { toast } = useToast();
    const { user, userProfile, practiceHistory, loading, recordPracticeAttempt, getTopicStats } = useUserData();
    
    const [selectedTopicId, setSelectedTopicId] = useLocalStorage<string>('selectedTopicId', phrasebook[0].id);
    const selectedTopic = useMemo(() => phrasebook.find(t => t.id === selectedTopicId) || phrasebook[0], [selectedTopicId]);

    const [selectedVoice, setSelectedVoice] = useLocalStorage<VoiceSelection>('selectedVoice', 'default');
    
    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const [lastAssessment, setLastAssessment] = useState<Record<string, AssessmentResult>>({});

    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isFetchingSettings, setIsFetchingSettings] = useState(true);

    useEffect(() => {
        getAppSettings().then(s => {
            setSettings(s)
            setIsFetchingSettings(false);
        });
    }, []);

    // Effect to handle aborting recognition on component unmount
    useEffect(() => {
        return () => {
            if (assessingPhraseId) {
                console.log(`[LearnPageContent] Unmounting with active assessment ${assessingPhraseId}. Aborting.`);
                abortRecognition();
            }
        };
    }, [assessingPhraseId]);
    
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
        if (assessingPhraseId) return; // Don't start a new assessment if one is in progress.
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
        
        console.log(`[LearnPageContent] Starting assessment for phraseId: ${phraseId}`);
        setAssessingPhraseId(phraseId);
        setLastAssessment(prev => ({ ...prev, [phraseId]: undefined } as any)); // Clear previous result for this phrase
    
        try {
            const assessment = await assessPronunciationFromMic(referenceText, toLanguage);
            console.log(`[LearnPageContent] Received assessment for ${phraseId}:`, assessment);
            const { isPass, accuracy, fluency } = assessment;

            const finalResult: AssessmentResult = { status: isPass ? 'pass' : 'fail', accuracy, fluency };
            setLastAssessment(prev => ({ ...prev, [phraseId]: finalResult }));
            
            recordPracticeAttempt({
                phraseId,
                phraseText: referenceText,
                topicId,
                lang: toLanguage,
                isPass,
                accuracy,
                settings
            });

        } catch (error: any) {
            console.error(`[LearnPageContent] Assessment failed for ${phraseId}:`, error);
            toast({ variant: 'destructive', title: 'Assessment Error', description: error.message || `An unexpected error occurred.`});
        } finally {
            console.log(`[LearnPageContent] Finalizing assessment for phraseId: ${phraseId}`);
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

    const topicStats = getTopicStats(selectedTopic.id, toLanguage);

    if (isFetchingSettings || loading) {
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
                                            <li>Click the <Mic className="inline-block h-4 w-4 mx-1" /> icon to practice your pronunciation. The mic will stop automatically when you pause.</li>
                                            { !user && <li className="font-bold">Log in to save your progress!</li> }
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
                                        onClick={() => setSelectedTopicId(topic.id)}
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
                                    <span>Correct: <strong>{topicStats.correct} / {selectedTopic.phrases.length}</strong></span>
                                </div>
                                <div className="flex items-center gap-1.5" title="Tokens earned from this topic">
                                    <Award className="h-4 w-4 text-amber-500" />
                                    <span>Tokens Earned: <strong>{topicStats.tokensEarned}</strong></span>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {sortedPhrases.map((phrase) => {
                                const fromText = getTranslation(phrase, fromLanguage);
                                const toText = getTranslation(phrase, toLanguage);
                                const fromAnswerText = phrase.answer ? getTranslation(phrase.answer, fromLanguage) : '';
                                const toAnswerText = phrase.answer ? getTranslation(phrase.answer, toLanguage) : '';

                                const assessment = lastAssessment[phrase.id];
                                const isAssessingCurrent = assessingPhraseId === phrase.id;
                                
                                const history = practiceHistory[phrase.id];
                                const passes = history?.passCountPerLang?.[toLanguage] || 0;
                                const fails = history?.failCountPerLang?.[toLanguage] || 0;

                                const getResultIcon = () => {
                                    if (isAssessingCurrent) return <LoaderCircle className="h-5 w-5 animate-spin" />;
                                    if (!assessment) return null;
                                    if (assessment.status === 'pass') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
                                    if (assessment.status === 'fail') return <XCircle className="h-5 w-5 text-red-500" />;
                                    return null;
                                };

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
                                                {getResultIcon()}
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play audio</span>
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => doAssessPronunciation(phrase, selectedTopic.id)} disabled={isAssessingCurrent || !!assessingPhraseId}>
                                                    <Mic className={cn("h-5 w-5", isAssessingCurrent && "text-red-500")} />
                                                    <span className="sr-only">Record pronunciation</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                     { user && (passes > 0 || fails > 0) &&
                                        <div className="text-xs text-muted-foreground flex items-center gap-4 border-t pt-2">
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

export default memo(LearnPageContent);
