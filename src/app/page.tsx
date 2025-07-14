
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, CheckCircle2, XCircle, LoaderCircle } from 'lucide-react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import type { Phrase } from '@/lib/data';
import { generateSpeech } from '@/ai/flows/tts-flow';
import { translateText } from '@/ai/flows/translate-flow';
import { assessPronunciation } from '@/ai/flows/pronunciation-assessment-flow';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type VoiceSelection = 'default' | 'male' | 'female';

type AssessmentStatus = 'unattempted' | 'pass' | 'fail' | 'in-progress';
type AssessmentResult = {
  status: AssessmentStatus;
  accuracy?: number;
  fluency?: number;
};

export default function LearnPage() {
    const [fromLanguage, setFromLanguage] = useState<LanguageCode>('english');
    const [toLanguage, setToLanguage] = useState<LanguageCode>('thai');
    const [selectedTopic, setSelectedTopic] = useState<Topic>(phrasebook[0]);
    const { isMobile } = useSidebar();
    const { toast } = useToast();
    const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [translatedPronunciation, setTranslatedPronunciation] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [activeTab, setActiveTab] = useState('phrasebook');
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>('default');

    // Pronunciation Assessment State
    const [assessmentResults, setAssessmentResults] = useState<Record<string, AssessmentResult>>({});
    const [isRecording, setIsRecording] = useState(false);
    const [recordingPhraseId, setRecordingPhraseId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setSpeechSynthesis(window.speechSynthesis);
    }, []);

    const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
        english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
        malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
        chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
    };

    const handleSwitchLanguages = () => {
        const currentInput = inputText;
        setFromLanguage(toLanguage);
        setToLanguage(fromLanguage);
        setInputText(translatedText);
        setTranslatedText(currentInput);
        setTranslatedPronunciation('');
    };

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || isRecording) return;
        const locale = languageToLocaleMap[lang];
        
        if (speechSynthesis && selectedVoice === 'default') {
            const voices = speechSynthesis.getVoices();
            const voice = voices.find(v => v.lang === locale);
            if (voice) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.voice = voice;
                utterance.lang = locale;
                speechSynthesis.speak(utterance);
                return;
            }
        }
        
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
            if (inputText && activeTab === 'live-translation') {
                handleTranslation();
            } else {
                setTranslatedText('');
                setTranslatedPronunciation('');
            }
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [inputText, fromLanguage, toLanguage, activeTab]);


    const handleTranslation = async () => {
        if (!inputText) return;
        setIsTranslating(true);
        try {
            const fromLangLabel = languages.find(l => l.value === fromLanguage)?.label || fromLanguage;
            const toLangLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
            const result = await translateText({ text: inputText, fromLanguage: fromLangLabel, toLanguage: toLangLabel });
            setTranslatedText(result.translatedText);
            setTranslatedPronunciation(result.pronunciation);
        } catch (error) {
            console.error('Translation failed', error);
            toast({
                variant: 'destructive',
                title: 'Translation Error',
                description: 'Could not translate the text.',
            });
        } finally {
            setIsTranslating(false);
        }
    };

    const handleStartRecording = async (phraseId: string, referenceText: string, lang: LanguageCode) => {
        if (isRecording) {
            handleStopRecording();
            return;
        }

        setRecordingPhraseId(phraseId);
        setIsRecording(true);
        audioChunksRef.current = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
                // Reset silence timer on new data
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(handleStopRecording, 1500); // 1.5s silence timeout
            };
            mediaRecorderRef.current.onstop = async () => {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result as string;
                    const locale = languageToLocaleMap[lang];
                    if (!locale) {
                        toast({ variant: "destructive", title: "Unsupported language for assessment." });
                        return;
                    }

                    try {
                         setAssessmentResults(prev => ({ ...prev, [phraseId]: { status: 'in-progress' } }));
                        const result = await assessPronunciation({
                            audioDataUri: base64Audio,
                            referenceText,
                            lang: locale,
                        });
                        setAssessmentResults(prev => ({
                            ...prev,
                            [phraseId]: {
                                status: result.passed ? 'pass' : 'fail',
                                accuracy: result.accuracyScore,
                                fluency: result.fluencyScore,
                            }
                        }));
                    } catch (err: any) {
                        console.error('Assessment failed', err);
                        toast({ variant: 'destructive', title: 'Assessment Error', description: err.message || 'Could not assess pronunciation.' });
                        setAssessmentResults(prev => ({ ...prev, [phraseId]: { status: 'fail' } }));
                    } finally {
                        setIsRecording(false);
                        setRecordingPhraseId(null);
                    }
                };
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.start();
            // Initial timeout
            silenceTimerRef.current = setTimeout(handleStopRecording, 1500);

        } catch (err) {
            console.error('Could not start recording', err);
            toast({ variant: 'destructive', title: 'Microphone Error', description: 'Could not access microphone. Please check permissions.' });
            setIsRecording(false);
            setRecordingPhraseId(null);
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const getTranslation = (textObj: { english: string; translations: Partial<Record<LanguageCode, string>> }, lang: LanguageCode) => {
        if (lang === 'english') {
            return textObj.english;
        }
        return textObj.translations[lang] || textObj.english;
    }

    const getPronunciation = (textObj: { pronunciations: Partial<Record<LanguageCode, string>> }, lang: LanguageCode) => {
        if (lang === 'english') {
            return null;
        }
        return textObj.pronunciations[lang];
    }
    
    const sortedPhrases = useMemo(() => {
        const getScore = (status: AssessmentStatus) => {
          switch (status) {
            case 'fail': return 0; // Fails first
            case 'in-progress': return 1;
            case 'unattempted': return 2; // Unattempted next
            case 'pass': return 3; // Passes last
            default: return 2;
          }
        };
    
        return [...selectedTopic.phrases].sort((a, b) => {
            const statusA = assessmentResults[`${a.id}-${toLanguage}`]?.status || assessmentResults[`${a.id}-${fromLanguage}`]?.status || 'unattempted';
            const statusB = assessmentResults[`${b.id}-${toLanguage}`]?.status || assessmentResults[`${b.id}-${fromLanguage}`]?.status || 'unattempted';
            return getScore(statusA) - getScore(statusB);
        });
      }, [selectedTopic.phrases, assessmentResults, fromLanguage, toLanguage]);

    const fromLanguageDetails = languages.find(l => l.value === fromLanguage);
    const toLanguageDetails = languages.find(l => l.value === toLanguage);

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isMobile && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Learn</h1>
                        <p className="text-muted-foreground">Essential phrases for your travels.</p>
                    </div>
                </div>
            </header>

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

                <Button variant="ghost" size="icon" className="mt-4 sm:mt-5 self-center" onClick={handleSwitchLanguages}>
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
            
            <Card className="shadow-lg">
                <CardContent className="space-y-6 pt-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="phrasebook">Phrasebook</TabsTrigger>
                            <TabsTrigger value="live-translation">Live Translation</TabsTrigger>
                        </TabsList>
                        <TabsContent value="phrasebook">
                            <div className="space-y-4 pt-6">
                                <div className="space-y-2">
                                     <Label htmlFor="topic-select">Select a Topic</Label>
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
                                            const fromPronunciation = getPronunciation(phrase, fromLanguage);
                                            const toText = getTranslation(phrase, toLanguage);
                                            const toPronunciation = getPronunciation(phrase, toLanguage);
                                            
                                            const fromAnswerText = phrase.answer ? getTranslation(phrase.answer, fromLanguage) : '';
                                            const fromAnswerPronunciation = phrase.answer ? getPronunciation(phrase.answer, fromLanguage) : '';
                                            const toAnswerText = phrase.answer ? getTranslation(phrase.answer, toLanguage) : '';
                                            const toAnswerPronunciation = phrase.answer ? getPronunciation(phrase.answer, toLanguage) : '';

                                            const fromPhraseId = `${phrase.id}-${fromLanguage}`;
                                            const toPhraseId = `${phrase.id}-${toLanguage}`;
                                            
                                            const fromResult = assessmentResults[fromPhraseId];
                                            const toResult = assessmentResults[toPhraseId];

                                            const isCurrentRecording = isRecording && (recordingPhraseId === fromPhraseId || recordingPhraseId === toPhraseId);
                                            const isRecordingFrom = isRecording && recordingPhraseId === fromPhraseId;
                                            const isRecordingTo = isRecording && recordingPhraseId === toPhraseId;

                                            const isInProgressFrom = fromResult?.status === 'in-progress';
                                            const isInProgressTo = toResult?.status === 'in-progress';

                                            return (
                                            <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div>
                                                            <p className="font-semibold text-lg">{fromText}</p>
                                                            {fromPronunciation && <p className="text-sm text-muted-foreground italic">{fromPronunciation}</p>}
                                                        </div>
                                                        <div className="flex items-center shrink-0">
                                                            <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(fromText, fromLanguage)} disabled={isRecording}>
                                                                <Volume2 className="h-5 w-5" />
                                                                <span className="sr-only">Play audio</span>
                                                            </Button>
                                                            <Button size="icon" variant={isRecordingFrom ? "destructive" : "ghost"} onClick={() => handleStartRecording(fromPhraseId, fromText, fromLanguage)} disabled={isRecording && !isRecordingFrom}>
                                                                <Mic className={cn("h-5 w-5", isRecordingFrom && "animate-pulse")} />
                                                                <span className="sr-only">Record pronunciation</span>
                                                            </Button>
                                                            {isInProgressFrom && <LoaderCircle className="h-5 w-5 text-muted-foreground animate-spin" />}
                                                            {fromResult?.status === 'pass' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                                            {fromResult?.status === 'fail' && <XCircle className="h-5 w-5 text-red-500" />}
                                                        </div>
                                                    </div>
                                                    {(fromResult?.status === 'pass' || fromResult?.status === 'fail') && (
                                                        <div className="text-xs text-muted-foreground pl-1">
                                                            <p>Accuracy: <span className="font-bold">{fromResult.accuracy?.toFixed(0) ?? 'N/A'}%</span> | Fluency: <span className="font-bold">{fromResult.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center w-full">
                                                         <div>
                                                            <p className="font-bold text-lg text-primary">{toText}</p>
                                                            {toPronunciation && <p className="text-sm text-muted-foreground italic">{toPronunciation}</p>}
                                                        </div>
                                                        <div className="flex items-center shrink-0">
                                                            <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)} disabled={isRecording}>
                                                                <Volume2 className="h-5 w-5" />
                                                                <span className="sr-only">Play audio</span>
                                                            </Button>
                                                             <Button size="icon" variant={isRecordingTo ? "destructive" : "ghost"} onClick={() => handleStartRecording(toPhraseId, toText, toLanguage)} disabled={isRecording && !isRecordingTo}>
                                                                <Mic className={cn("h-5 w-5", isRecordingTo && "animate-pulse")} />
                                                                <span className="sr-only">Record pronunciation</span>
                                                            </Button>
                                                            {isInProgressTo && <LoaderCircle className="h-5 w-5 text-muted-foreground animate-spin" />}
                                                            {toResult?.status === 'pass' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                                            {toResult?.status === 'fail' && <XCircle className="h-5 w-5 text-red-500" />}
                                                        </div>
                                                    </div>
                                                    {(toResult?.status === 'pass' || toResult?.status === 'fail') && (
                                                        <div className="text-xs text-muted-foreground pl-1">
                                                            <p>Accuracy: <span className="font-bold">{toResult.accuracy?.toFixed(0) ?? 'N/A'}%</span> | Fluency: <span className="font-bold">{toResult.fluency?.toFixed(0) ?? 'N/A'}%</span></p>
                                                        </div>
                                                    )}
                                                </div>

                                                {phrase.answer && (
                                                    <>
                                                        <div className="border-t border-dashed border-border my-2"></div>
                                                        <div className="flex justify-between items-center w-full">
                                                            <div>
                                                                <p className="font-semibold text-lg">{fromAnswerText}</p>
                                                                {fromAnswerPronunciation && <p className="text-sm text-muted-foreground italic">{fromAnswerPronunciation}</p>}
                                                            </div>
                                                            <div className="flex items-center shrink-0">
                                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(fromAnswerText, fromLanguage)} disabled={isRecording}>
                                                                    <Volume2 className="h-5 w-5" />
                                                                    <span className="sr-only">Play audio</span>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center w-full">
                                                            <div>
                                                                <p className="font-bold text-lg text-primary">{toAnswerText}</p>
                                                                {toAnswerPronunciation && <p className="text-sm text-muted-foreground italic">{toAnswerPronunciation}</p>}
                                                            </div>
                                                            <div className="flex items-center shrink-0">
                                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toAnswerText, toLanguage)} disabled={isRecording}>
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
                        </TabsContent>
                        <TabsContent value="live-translation">
                            <div className="space-y-4 pt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="input-text">{fromLanguageDetails?.label}</Label>
                                        <Textarea 
                                            id="input-text"
                                            placeholder={`Enter text in ${fromLanguageDetails?.label}...`}
                                            className="min-h-[150px] resize-none"
                                            value={inputText}
                                            onChange={(e) => setInputText(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="translated-output">{toLanguageDetails?.label}</Label>
                                        <div id="translated-output" className="relative border rounded-md min-h-[150px] w-full bg-background px-3 py-2">
                                            <div className="flex flex-col h-full">
                                                <p className="flex-grow text-base md:text-sm text-foreground">
                                                  {isTranslating ? 'Translating...' : translatedText || <span className="text-muted-foreground">Translation</span>}
                                                </p>
                                                {translatedPronunciation && !isTranslating && (
                                                    <p className="text-sm text-muted-foreground italic mt-2">{translatedPronunciation}</p>
                                                )}
                                            </div>
                                            <div className="absolute top-2 right-2 flex flex-col space-y-2">
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translatedText, toLanguage)}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play audio</span>
                                                </Button>
                                                 <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" disabled>
                                                                <Mic className="h-5 w-5" />
                                                                <span className="sr-only">Use microphone</span>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Speech input coming soon!</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
