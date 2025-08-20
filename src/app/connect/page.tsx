
"use client";

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainHeader from '@/components/layout/MainHeader';
import { MessageCircle, Users, Radio } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';

// Dynamically import the tab components to keep the initial page load light.
const VibesTab = React.lazy(() => import('@/app/connect/components/VibesTab'));
const VoiceRoomsTab = React.lazy(() => import('@/app/connect/components/VoiceRoomsTab'));
const MeetupsTab = React.lazy(() => import('@/app/connect/components/MeetupsTab'));


function ConnectPageContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'vibes');

    const tabsConfig = [
        { value: 'vibes', label: 'Vibes', icon: MessageCircle, component: <VibesTab /> },
        { value: 'meetups', label: 'Meetups', icon: Users, component: <MeetupsTab /> },
        { value: 'voice-rooms', label: 'Voice Rooms', icon: Radio, component: <VoiceRoomsTab /> },
    ];

    return (
        <div className="space-y-8">
            <MainHeader title="Connect" description="Join community chats, schedule voice rooms, and find meetups." />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    {tabsConfig.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="flex-col h-auto md:flex-row md:gap-2">
                            <tab.icon className="h-5 w-5 md:mr-2" />
                            <span className="hidden md:inline">{tab.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                 <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                    {tabsConfig.map((tab) => (
                        <TabsContent key={tab.value} value={tab.value} className="mt-6">
                            {/* Render component only when its tab is active */}
                            {activeTab === tab.value && tab.component}
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

