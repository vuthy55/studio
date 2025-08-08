
"use client";

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainHeader from '@/components/layout/MainHeader';
import { MessageCircle, Users, Radio } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';

// Dynamically import the tab components to keep the initial page load light.
const ChatzTab = React.lazy(() => import('@/app/connect/components/ChatzTab'));
const VoiceRoomsTab = React.lazy(() => import('@/app/connect/components/VoiceRoomsTab'));
const MeetupsTab = React.lazy(() => import('@/app/connect/components/MeetupsTab'));


function ConnectPageContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'chatz');

    const tabsConfig = [
        { value: 'chatz', label: 'Chatz', icon: MessageCircle, component: <ChatzTab /> },
        { value: 'voice-rooms', label: 'Voice Rooms', icon: Radio, component: <VoiceRoomsTab /> },
        { value: 'meetups', label: 'Meetups', icon: Users, component: <MeetupsTab /> },
    ];

    return (
        <div className="space-y-8">
            <MainHeader title="Connect" description="Join community chats, schedule voice rooms, and find meetups." />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    {tabsConfig.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            <tab.icon className="mr-2 h-4 w-4" />
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                 <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                    {tabsConfig.map((tab) => (
                        <TabsContent key={tab.value} value={tab.value}>
                            {tab.component}
                        </TabsContent>
                    ))}
                </Suspense>
            </Tabs>
        </div>
    );
}

export default function ConnectPage() {
     return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <ConnectPageContent />
        </Suspense>
    );
}
