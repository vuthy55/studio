
"use client";

import { useState, memo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainHeader from '@/components/layout/MainHeader';
import { BookOpen, Languages, LoaderCircle } from 'lucide-react';
import PhrasebookTab from './PhrasebookTab';
import TranslatorTab from './TranslatorTab';

// Memoize components to prevent re-renders when switching tabs
const MemoizedPhrasebookTab = PhrasebookTab;
const MemoizedTranslatorTab = TranslatorTab;

function LearnPageContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'phrasebook');

    const tabsConfig = [
        { value: 'phrasebook', label: 'Phrasebook', icon: BookOpen, component: <MemoizedPhrasebookTab /> },
        { value: 'translator', label: 'Translator', icon: Languages, component: <MemoizedTranslatorTab /> },
    ];

    return (
        <div className="space-y-8">
            <MainHeader title="Learn" description="Master essential phrases and practice your pronunciation." />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    {tabsConfig.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="flex-col h-auto md:flex-row md:gap-2">
                            <tab.icon className="h-5 w-5 md:mr-2" />
                            <span className="hidden md:inline">{tab.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                {tabsConfig.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value}>
                        {tab.component}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}

export default function LearnPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <LearnPageContent />
        </Suspense>
    );
}
