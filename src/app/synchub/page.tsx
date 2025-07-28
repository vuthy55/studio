
"use client";

import { useState, memo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LearnPageContent from '@/components/synchub/LearnPageContent';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle } from 'lucide-react';
import SyncLiveContent from '@/components/synchub/SyncLiveContent';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import SyncOnlineHome from '@/components/synchub/SyncOnlineHome';
import { useUserData } from '@/context/UserDataContext';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';

// Statically import all components to ensure they are available in offline mode.
const MemoizedLearnPage = memo(LearnPageContent);
const MemoizedSyncLive = memo(SyncLiveContent);
const MemoizedLiveTranslation = memo(LiveTranslationContent);
const MemoizedSyncOnline = memo(SyncOnlineHome);


function SyncHubTabs() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'prep-vibe');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);
    
    return (
         <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="prep-vibe">Prep Your Vibe</TabsTrigger>
                <TabsTrigger value="live-translation">Live Translation</TabsTrigger>
                <TabsTrigger value="sync-live">Sync Live</TabsTrigger>
                <TabsTrigger value="sync-online">Sync Online</TabsTrigger>
            </TabsList>
            <TabsContent value="prep-vibe" className="mt-6">
                <MemoizedLearnPage />
            </TabsContent>
            <TabsContent value="live-translation" className="mt-6">
                <MemoizedLiveTranslation />
            </TabsContent>
            <TabsContent value="sync-live" className="mt-6">
                <MemoizedSyncLive />
            </TabsContent>
            <TabsContent value="sync-online" className="mt-6">
                <MemoizedSyncOnline />
            </TabsContent>
        </Tabs>
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
                    <SyncHubTabs />
                    <Tour />
                </TourProvider>
            </Suspense>
        </div>
    );
}
