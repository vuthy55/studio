
"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import LearnPageContent from '@/components/synchub/LearnPageContent';
import ConversePageContent from '@/components/synchub/ConversePageContent';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wifi } from 'lucide-react';


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
                <TabsContent value="prep-vibe">
                    <LearnPageContent />
                </TabsContent>
                 <TabsContent value="live-translation">
                    <LiveTranslationContent />
                </TabsContent>
                <TabsContent value="sync-live">
                   <ConversePageContent />
                </TabsContent>
                <TabsContent value="sync-online">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                            <CardDescription>This feature is coming soon! Connect with other learners online.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Stay tuned for updates. Here you'll be able to practice your skills in real-time conversations with native speakers and fellow learners from around the world.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
