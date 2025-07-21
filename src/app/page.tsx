
"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import LearnPageContent from '@/components/synchub/LearnPageContent';
import GroupConverseContent from '@/components/synchub/GroupConverseContent';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import SyncOnlineHome from '@/components/synchub/SyncOnlineHome';


export default function SyncHubPage() {
    const { isMobile } = useSidebar();
    const [activeTab, setActiveTab] = useState('prep-vibe');
   
    return (
        <div className="space-y-8">
             <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isMobile && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold font-headline">SyncHub</h1>
                        <p className="text-muted-foreground">Prepare, practice, and connect.</p>
                    </div>
                </div>
            </header>

             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="prep-vibe">Prep Your Vibe</TabsTrigger>
                    <TabsTrigger value="live-translation">Live Translation</TabsTrigger>
                    <TabsTrigger value="sync-live">Sync Live</TabsTrigger>
                    <TabsTrigger value="sync-online">Sync Online</TabsTrigger>
                </TabsList>
                <TabsContent value="prep-vibe" className="mt-6" forceMount>
                    <LearnPageContent />
                </TabsContent>
                <TabsContent value="live-translation" className="mt-6" forceMount>
                   <LiveTranslationContent />
                </TabsContent>
                <TabsContent value="sync-live" className="mt-6" forceMount>
                   <GroupConverseContent />
                </TabsContent>
                <TabsContent value="sync-online" className="mt-6" forceMount>
                    <SyncOnlineHome />
                </TabsContent>
            </Tabs>
        </div>
    );
}
