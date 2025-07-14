
"use client";

import { useState, useEffect } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, ArrowRightLeft, Mic } from 'lucide-react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from '@/components/ui/textarea';
import type { Phrase } from '@/lib/data';
import { generateSpeech } from '@/ai/flows/tts-flow';
import { translateText } from '@/ai/flows/translate-flow';
import { useToast } from '@/hooks/use-toast';

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
        if (!text) return;
        const locale = languageToLocaleMap[lang];
        if (!locale) {
            console.error("Locale not found for language:", lang);
            return;
        }

        if (speechSynthesis) {
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
            const response = await generateSpeech({ text, lang: locale });
            const audio = new Audio(response.audioDataUri);
            audio.play().catch(e => console.error("Audio playback failed.", e));
        } catch (error) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Error generating audio',
                description: 'Could not generate audio for the selected language.',
            });
        }
    };
    
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (inputText) {
                handleTranslation();
            } else {
                setTranslatedText('');
                setTranslatedPronunciation('');
            }
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [inputText, fromLanguage, toLanguage]);


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

    const getTranslation = (phrase: Phrase, lang: LanguageCode) => {
        if (lang === 'english') {
            return phrase.english;
        }
        return phrase.translations[lang] || phrase.english;
    }

    const getPronunciation = (phrase: Phrase, lang: LanguageCode) => {
        if (lang === 'english') {
            return null; // No pronunciation guide for english
        }
        return phrase.pronunciations[lang];
    }

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
                    <label className="text-sm font-medium text-muted-foreground">From</label>
                    <Select value={fromLanguage} onValueChange={(value) => setFromLanguage(value as LanguageCode)}>
                        <SelectTrigger>
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
                    <label className="text-sm font-medium text-muted-foreground">To</label>
                    <Select value={toLanguage} onValueChange={(value) => setToLanguage(value as LanguageCode)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                        <SelectContent>
                            {languages.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            <Accordion type="single" collapsible className="w-full" defaultValue="phrasebook">
                <AccordionItem value="phrasebook">
                    <AccordionTrigger>
                        <h2 className="text-2xl font-bold font-headline">Phrasebook</h2>
                    </AccordionTrigger>
                    <AccordionContent>
                        <Card className="shadow-lg">
                            <CardContent className="space-y-6 pt-6">
                                <TooltipProvider>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                    {phrasebook.map((topic) => (
                                        <Tooltip key={topic.id}>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant={selectedTopic.id === topic.id ? "default" : "secondary"}
                                                    className="h-24 w-full flex flex-col justify-center items-center text-center p-0.5 shadow-sm hover:shadow-md transition-shadow data-[variant=default]:bg-primary"
                                                    onClick={() => setSelectedTopic(topic)}
                                                >
                                                    <topic.icon className="h-24 w-24" />
                                                    <span className="sr-only">{topic.title}</span>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{topic.title}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>
                                </TooltipProvider>

                                <div>
                                    <h3 className="text-xl font-bold font-headline flex items-center gap-3 mb-4 mt-6">
                                        <selectedTopic.icon className="h-6 w-6 text-accent" /> 
                                        {selectedTopic.title}: {fromLanguageDetails?.label} to {toLanguageDetails?.label}
                                    </h3>
                                    <div className="space-y-4">
                                        {selectedTopic.phrases.map((phrase) => {
                                            const fromText = getTranslation(phrase, fromLanguage);
                                            const fromPronunciation = getPronunciation(phrase, fromLanguage);
                                            const toText = getTranslation(phrase, toLanguage);
                                            const toPronunciation = getPronunciation(phrase, toLanguage);
                                            return (
                                            <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex flex-col gap-3 transition-all duration-300 hover:bg-secondary/70 border">
                                                <div className="flex justify-between items-center w-full">
                                                    <div>
                                                        <p className="font-semibold text-md">{fromText}</p>
                                                        {fromPronunciation && <p className="text-sm text-muted-foreground italic">{fromPronunciation}</p>}
                                                    </div>
                                                    <div className="flex items-center shrink-0">
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
                                                        <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(fromText, fromLanguage)}>
                                                            <Volume2 className="h-5 w-5" />
                                                            <span className="sr-only">Play audio</span>
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center w-full text-primary-foreground">
                                                     <div>
                                                        <p className="font-semibold text-lg">{toText}</p>
                                                        {toPronunciation && <p className="text-sm text-muted-foreground italic">{toPronunciation}</p>}
                                                    </div>
                                                    <div className="flex items-center shrink-0">
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
                                                        <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(toText, toLanguage)}>
                                                            <Volume2 className="h-5 w-5" />
                                                            <span className="sr-only">Play audio</span>
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
             <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="live-translation">
                    <AccordionTrigger>
                        <h2 className="text-2xl font-bold font-headline">Live Translation</h2>
                    </AccordionTrigger>
                    <AccordionContent>
                        <Card className="shadow-lg">
                            <CardContent className="space-y-4 pt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{fromLanguageDetails?.label}</label>
                                        <Textarea 
                                            placeholder={`Enter text in ${fromLanguageDetails?.label}...`}
                                            className="min-h-[150px] resize-none"
                                            value={inputText}
                                            onChange={(e) => setInputText(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{toLanguageDetails?.label}</label>
                                        <div className="relative border rounded-md">
                                            <Textarea 
                                                placeholder={isTranslating ? 'Translating...' : 'Translation'}
                                                className="min-h-[150px] resize-none pr-20 border-0 focus-visible:ring-0"
                                                value={translatedText}
                                                readOnly
                                            />
                                             {translatedPronunciation && (
                                                <div className="absolute bottom-0 left-0 w-full px-3 py-2">
                                                    <p className="text-sm text-muted-foreground italic">{translatedPronunciation}</p>
                                                </div>
                                             )}
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
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
