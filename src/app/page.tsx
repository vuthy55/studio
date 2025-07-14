"use client";

import { useState } from 'react';
import { languages, phrasebook, type LanguageCode, type Topic } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, Languages } from 'lucide-react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export default function LearnPage() {
    const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('thai');
    const [selectedTopic, setSelectedTopic] = useState<Topic>(phrasebook[0]);
    const { isMobile } = useSidebar();

    const handlePlayAudio = (text: string, lang: LanguageCode) => {
        // This uses a non-production Google TTS endpoint for demonstration.
        // A production app should use a dedicated TTS service like Azure or Browser's SpeechSynthesis API.
        const langMap: Partial<Record<LanguageCode, string>> = {
            english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
            malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
            chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
        };
        const voiceLang = langMap[lang] || 'en-US';
        const audio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${voiceLang}&client=tw-ob`);
        audio.play().catch(e => console.error("Audio playback failed.", e));
    };

    const targetLanguageDetails = languages.find(l => l.value === selectedLanguage);

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
                <div className="flex items-center gap-2 self-start">
                    <Languages className="h-5 w-5 text-muted-foreground" />
                    <Select value={selectedLanguage} onValueChange={(value) => setSelectedLanguage(value as LanguageCode)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                        <SelectContent>
                            {languages.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </header>

            <section>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {phrasebook.map((topic) => (
                        <Button
                            key={topic.id}
                            variant={selectedTopic.id === topic.id ? "default" : "secondary"}
                            className="h-28 flex flex-col gap-2 justify-center items-center text-center p-4 shadow-sm hover:shadow-md transition-shadow"
                            onClick={() => setSelectedTopic(topic)}
                        >
                            <topic.icon className="h-8 w-8 text-primary" />
                            <span className="font-semibold">{topic.title}</span>
                        </Button>
                    ))}
                </div>
            </section>
            
            <Accordion type="single" collapsible className="w-full" defaultValue="phrasebook">
                <AccordionItem value="phrasebook">
                    <AccordionTrigger>
                        <h2 className="text-2xl font-bold font-headline">Phrasebook</h2>
                    </AccordionTrigger>
                    <AccordionContent>
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-3 font-headline">
                                    <selectedTopic.icon className="h-6 w-6 text-accent" /> 
                                    {selectedTopic.title} in {targetLanguageDetails?.label || '...'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {selectedTopic.phrases.map((phrase) => {
                                        const translation = phrase.translations[selectedLanguage] || phrase.english;
                                        return (
                                        <div key={phrase.id} className="bg-background/80 p-4 rounded-lg flex justify-between items-center transition-all duration-300 hover:bg-secondary/70 border">
                                            <div>
                                                <p className="font-semibold text-lg text-primary-foreground">{translation}</p>
                                                <p className="text-sm text-muted-foreground">{phrase.english}</p>
                                            </div>
                                            <Button size="icon" variant="ghost" onClick={() => handlePlayAudio(translation, selectedLanguage)}>
                                                <Volume2 className="h-5 w-5 text-accent" />
                                                <span className="sr-only">Play audio</span>
                                            </Button>
                                        </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}