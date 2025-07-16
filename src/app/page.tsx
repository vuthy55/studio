
"use client";

import { useState, useMemo, useEffect } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic, LoaderCircle, Info } from 'lucide-react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { generateSpeech } from '@/services/tts';
import { translateText } from '@/services/translation';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useDebounce } from '@/hooks/use-debounce';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

type VoiceSelection = 'default' | 'male' | 'female';

export default function LearnPage() {
    const [fromLanguage, setFromLanguage] = useState<LanguageCode>('english');
    const [toLanguage, setToLanguage] = useState<LanguageCode>('thai');
    const [selectedTopic, setSelectedTopic] = useState<Topic>(phrasebook[0]);
    const { isMobile } = useSidebar();
    const { toast } = useToast();
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [activeTab, setActiveTab] = useState('phrasebook');
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>('default');
    const [isRecognizing, setIsRecognizing] = useState(false);
    const debouncedInputText = useDebounce(inputText, 500);
    

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
    };

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || isRecognizing) return;
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
                description: 'Could not generate audio. Azure credentials might be missing or incorrect.',
            });
        }
    };
    
    const handleTranslation = async (textToTranslate: string) => {
        if (!textToTranslate) {
            setTranslatedText('');
            return;
        }
        setIsTranslating(true);
        try {
            const fromLangLabel = languages.find(l => l.value === fromLanguage)?.label || fromLanguage;
            const toLangLabel = languages.find(l => l.value === toLanguage)?.label || toLanguage;
            const result = await translateText({ text: textToTranslate, fromLanguage: fromLangLabel, toLanguage: toLangLabel });
            setTranslatedText(result.translatedText);
        } catch (error) {
            console.error('Translation failed', error);
            toast({
                variant: 'destructive',
                title: 'Translation Error',
                description: 'Could not translate the text. Azure credentials might be missing or incorrect.',
            });
        } finally {
            setIsTranslating(false);
        }
    };

    useEffect(() => {
        if (debouncedInputText && activeTab === 'live-translation') {
            handleTranslation(debouncedInputText);
        } else if (!debouncedInputText) {
            setTranslatedText('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedInputText, fromLanguage, toLanguage, activeTab]);


    const recognizeFromMicrophone = async () => {
        const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
        const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
    
        if (!azureKey || !azureRegion) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'Azure credentials are not configured for speech recognition.' });
            return;
        }

        const locale = languageToLocaleMap[fromLanguage];
        if (!locale) {
            toast({ variant: 'destructive', title: 'Unsupported Language' });
            return;
        }

        setIsRecognizing(true);
        let recognizer: sdk.SpeechRecognizer | undefined;

        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = locale;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer!.recognizeOnceAsync(resolve, reject);
            });

            if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.text) {
                setInputText(result.text);
            } else {
                 toast({ variant: 'destructive', title: 'Recognition Failed', description: `Could not recognize speech. Please try again. Reason: ${sdk.ResultReason[result.reason]}` });
            }
        } catch (error) {
            console.error("Error during speech recognition:", error);
            toast({ variant: 'destructive', title: 'Recognition Error', description: `An unexpected error occurred during speech recognition.` });
        } finally {
            if (recognizer) {
                recognizer.close();
            }
            setIsRecognizing(false);
        }
    }
    
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
                                            
                                            return (
                                            <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div>
                                                            <p className="font-semibold text-lg">{fromText}</p>
                                                        </div>
                                                        <div className="flex items-center shrink-0">
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center w-full">
                                                         <div>
                                                            <p className="font-bold text-lg text-primary">{toText}</p>
                                                        </div>
                                                        <div className="flex items-center shrink-0">
                                                            <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)}>
                                                                <Volume2 className="h-5 w-5" />
                                                                <span className="sr-only">Play audio</span>
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
                                                            <div className="flex items-center shrink-0">
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center w-full">
                                                            <div>
                                                                <p className="font-bold text-lg text-primary">{toAnswerText}</p>
                                                            </div>
                                                            <div className="flex items-center shrink-0">
                                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toAnswerText, toLanguage)}>
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
                                        <div className="relative border rounded-md min-h-[150px] w-full bg-background px-3 py-2">
                                            <Textarea 
                                                id="input-text"
                                                placeholder={`Enter text or use the mic...`}
                                                className="min-h-[120px] resize-none border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                                                value={inputText}
                                                onChange={(e) => setInputText(e.target.value)}
                                                disabled={isRecognizing}
                                            />
                                            <div className="absolute bottom-2 right-2">
                                                 <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant={isRecognizing ? "destructive" : "ghost"} onClick={recognizeFromMicrophone} disabled={isRecognizing}>
                                                                {isRecognizing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                                                                <span className="sr-only">Use microphone</span>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Use microphone to input text</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="translated-output">{toLanguageDetails?.label}</Label>
                                        <div id="translated-output" className="relative border rounded-md min-h-[150px] w-full bg-background px-3 py-2">
                                            <div className="flex flex-col h-full pr-10">
                                                <p className="flex-grow text-base md:text-sm text-foreground">
                                                  {isTranslating ? 'Translating...' : translatedText || <span className="text-muted-foreground">Translation</span>}
                                                </p>
                                            </div>
                                            <div className="absolute top-2 right-2 flex flex-col space-y-1 items-center">
                                                <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translatedText, toLanguage)} disabled={isTranslating || !translatedText || isRecognizing}>
                                                    <Volume2 className="h-5 w-5" />
                                                    <span className="sr-only">Play audio</span>
                                                </Button>
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
