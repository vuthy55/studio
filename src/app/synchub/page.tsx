
"use client";

import { useState, memo, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LearnPageContent from '@/components/synchub/LearnPageContent';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle } from 'lucide-react';

// Default tab is loaded statically for instant display.
const MemoizedLearnPage = memo(LearnPageContent);

// Other tabs are lazy-loaded to speed up the initial page load.
const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-64">
        <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
    </div>
);

const DynamicSyncLive = dynamic(() => import('@/components/synchub/SyncLiveContent'), {
    suspense: true,
    loading: () => <LoadingSpinner />,
});
const DynamicLiveTranslation = dynamic(() => import('@/components/synchub/LiveTranslationContent'), {
    suspense: true,
    loading: () => <LoadingSpinner />,
});
const DynamicSyncOnline = dynamic(() => import('@/components/synchub/SyncOnlineHome'), {
    suspense: true,
    loading: () => <LoadingSpinner />,
});

const MemoizedSyncLive = memo(DynamicSyncLive);
const MemoizedLiveTranslation = memo(DynamicLiveTranslation);
const MemoizedSyncOnline = memo(DynamicSyncOnline);

function SyncHubTabs() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'prep-vibe');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        if (window.location.hash) {
            const id = window.location.hash.substring(1);
            // Use a timeout to ensure the dynamic content has loaded
            setTimeout(() => {
                const element = document.getElementById(id);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100); 
        }
    }, [activeTab]); // Rerunning on activeTab change is correct here

    return (
         <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="prep-vibe">Prep Your Vibe</TabsTrigger>
                <TabsTrigger value="sync-live">Sync Live</TabsTrigger>
                <TabsTrigger value="live-translation">Live Translation</TabsTrigger>
                <TabsTrigger value="sync-online">Sync Online</TabsTrigger>
            </TabsList>
            <TabsContent value="prep-vibe" className="mt-6">
                <MemoizedLearnPage />
            </TabsContent>
            <TabsContent value="sync-live" className="mt-6">
                <Suspense fallback={<LoadingSpinner />}>
                    <MemoizedSyncLive />
                </Suspense>
            </TabsContent>
            <TabsContent value="live-translation" className="mt-6">
                <Suspense fallback={<LoadingSpinner />}>
                    <MemoizedLiveTranslation />
                </Suspense>
            </TabsContent>
            <TabsContent value="sync-online" className="mt-6">
                <Suspense fallback={<LoadingSpinner />}>
                    <MemoizedSyncOnline />
                </Suspense>
            </TabsContent>
        </Tabs>
    );
}


export default function SyncHubPage() {
    return (
        <div className="space-y-8">
            <MainHeader title="SyncHub" description="Prepare, practice, and connect." />
             <Suspense fallback={<LoadingSpinner />}>
                <SyncHubTabs />
            </Suspense>
        </div>
    );
}
