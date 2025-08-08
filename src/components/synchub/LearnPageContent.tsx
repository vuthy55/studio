
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen as PhrasebookIcon, Languages as TranslateIcon } from 'lucide-react';
import PhrasebookContent from './PhrasebookContent';
import TranslatorContent from './TranslatorContent';

export default function LearnPageContent() {
    return (
        <Tabs defaultValue="learn" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="learn"><PhrasebookIcon className="mr-2"/> Phrasebook</TabsTrigger>
                <TabsTrigger value="translator"><TranslateIcon className="mr-2"/> Translator</TabsTrigger>
            </TabsList>
            <TabsContent value="learn">
                <PhrasebookContent />
            </TabsContent>
            <TabsContent value="translator">
                <TranslatorContent />
            </TabsContent>
        </Tabs>
    );
}
