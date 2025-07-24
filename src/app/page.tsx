
"use client";

import { useState, memo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from '@/components/ui/sidebar';
import LearnPageContent from '@/components/synchub/LearnPageContent';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import SyncOnlineHome from '@/components/synchub/SyncOnlineHome';
import SyncLiveContent from '@/components/synchub/SyncLiveContent';
import MainHeader from '@/components/layout/MainHeader';

// Memoize the components to prevent unnecessary re-renders when the tab changes.
// By defining them here as stable constants, we ensure React doesn't unmount them.
const MemoizedLearnPage = memo(LearnPageContent);
const MemoizedLiveTranslation = memo(LiveTranslationContent);
const MemoizedSyncLive = memo(SyncLiveContent);
const MemoizedSyncOnline = memo(SyncOnlineHome);


export default function SyncHubPage() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState('prep-vibe');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);
   
    return (
        <div className="space-y-8">
            <MainHeader title="SyncHub" description="Prepare, practice, and connect." />
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
        </div>
    );
}
