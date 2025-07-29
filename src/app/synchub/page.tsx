
"use client";

import { useState, memo, useEffect, Suspense, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LearnPageContent from '@/components/synchub/LearnPageContent';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle, BookOpen, Languages, Mic, RadioTower } from 'lucide-react';
import SyncLiveContent from '@/components/synchub/SyncLiveContent';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import SyncOnlineHome from '@/components/synchub/SyncOnlineHome';
import { useUserData } from '@/context/UserDataContext';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Memoize components to prevent re-renders when switching tabs
const MemoizedLearnPage = memo(LearnPageContent);
const MemoizedLiveTranslation = memo(LiveTranslationContent);
const MemoizedSyncLive = memo(SyncLiveContent);
const MemoizedSyncOnline = memo(SyncOnlineHome);


function SyncHubPageContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'prep-vibe');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams, activeTab]);
    
    const tabsConfig = [
        { value: 'prep-vibe', label: 'Prep Your Vibe', icon: BookOpen },
        { value: 'live-translation', label: 'Live Translation', icon: Languages },
        { value: 'sync-live', label: 'Sync Live', icon: Mic },
        { value: 'sync-online', label: 'Sync Online', icon: RadioTower },
    ];

    return (
        <div className="relative">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    {tabsConfig.map((tab) => (
                        <TooltipProvider key={tab.value} delayDuration={0}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <TabsTrigger value={tab.value} className="flex-col md:flex-row h-auto md:h-10 py-2 md:py-1.5 gap-1 md:gap-2">
                                        <tab.icon className="h-5 w-5" />
                                        <span className="hidden md:inline">{tab.label}</span>
                                    </TabsTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="md:hidden">
                                    <p>{tab.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ))}
                </TabsList>
                 <TabsContent value="prep-vibe">
                    <MemoizedLearnPage />
                </TabsContent>
                <TabsContent value="live-translation">
                    <MemoizedLiveTranslation />
                </TabsContent>
                <TabsContent value="sync-live">
                    <MemoizedSyncLive />
                </TabsContent>
                <TabsContent value="sync-online">
                    <MemoizedSyncOnline />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function SyncHubPage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <MainHeader title="SyncHub" description="Prepare, practice, and connect." />
             <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                <TourProvider>
                    <SyncHubPageContent />
                    <Tour />
                </TourProvider>
            </Suspense>
        </div>
    );
}
