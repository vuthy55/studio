

"use client";

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoaderCircle, RadioTower, Users, Settings, Coins, MessageSquareQuote, Info, BellOff, Music, RefreshCw, LifeBuoy, Webhook, Globe, Bot, ChevronRight, Database, CheckCircle2, MessageSquare, LineChart, Trash2, AlertTriangle, Train, Leaf } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainHeader from '@/components/layout/MainHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// Dynamically import the tab components
const RoomsTab = lazy(() => import('./components/RoomsTab'));
const UsersTab = lazy(() => import('./components/UsersTab'));
const FeedbackTab = lazy(() => import('./components/FeedbackTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab'));
const IntelTab = lazy(() => import('./components/IntelTab'));
const FinancialTab = lazy(() => import('./components/FinancialTab'));
const TokensTab = lazy(() => import('./components/TokensTab'));
const LanguagePacksTab = lazy(() => import('./components/LanguagePacksTab'));
const BulkActionsTab = lazy(() => import('./components/BulkActionsTab'));
const MessagingTab = lazy(() => import('./components/MessagingTab'));
const ReportsTab = lazy(() => import('./components/ReportsTab'));
const TransportTab = lazy(() => import('./components/TransportTab'));
const EcoIntelTab = lazy(() => import('./components/EcoIntelTab'));


const LoadingFallback = () => (
    <div className="flex justify-center items-center py-10">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
);

const adminFeatureDescriptions = [
    { icon: RadioTower, title: "Rooms", description: "Manage Sync Online rooms and Common Rooms (Vibes). View active sessions and delete rooms if necessary." },
    { icon: Users, title: "Users", description: "Search, view, and manage all user accounts. Access detailed user profiles, transaction histories, and stats." },
    { icon: AlertTriangle, title: "Reports", description: "Review and moderate user-reported content (Vibes). Take action such as dismissing reports or archiving content." },
    { icon: LifeBuoy, title: "Feedback", description: "View and manage user-submitted feedback, bug reports, and feature requests." },
    { icon: Settings, title: "App Settings", description: "Configure global application settings, including the token economy, feature costs, and community rules." },
    { icon: Globe, title: "Intel", description: "Manage the AI data sources and the country intelligence database used by the InfoHub feature." },
    { icon: Train, title: "Transport", description: "Manage the AI data sources for transportation providers in each country." },
    { icon: Leaf, title: "Eco-Intel", description: "Manage the database for eco-friendly offsetting opportunities and carbon calculation sources." },
    { icon: LineChart, title: "Financial", description: "View the central ledger of all real-money transactions (e.g., PayPal purchases and donations) for auditing." },
    { icon: Coins, title: "Tokens", description: "Analyze the token economy, view the system-wide token transaction ledger, and manually issue tokens to users." },
    { icon: Music, title: "Language Packs", description: "Generate and manage offline audio packs for different languages and configure which packs are free for users." },
    { icon: Trash2, title: "Bulk Actions", description: "Perform system-wide data operations, such as deleting multiple users at once or clearing all notifications." },
    { icon: MessageSquareQuote, title: "Messaging", description: "Access and review standardized documents like the Admin SOP, marketing copy, and app policies." },
];

function AdminInfoDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Admin Dashboard Guide</DialogTitle>
                    <DialogDescription>A quick reference for each section of the admin panel.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4 py-4">
                        {adminFeatureDescriptions.map(feature => (
                            <div key={feature.title} className="flex items-start gap-4">
                                <feature.icon className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                <div>
                                    <h4 className="font-semibold">{feature.title}</h4>
                                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button>Got it</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function AdminPageV2() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'rooms');

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        router.push(`/admin?tab=${value}`, { scroll: false });
    };
    
    useEffect(() => {
        const currentTab = searchParams.get('tab');
        if (currentTab && currentTab !== activeTab) {
            setActiveTab(currentTab);
        }
    }, [searchParams, activeTab]);

    const adminTabs = [
        { value: 'rooms', label: 'Rooms', icon: RadioTower, component: <RoomsTab /> },
        { value: 'users', label: 'Users', icon: Users, component: <UsersTab /> },
        { value: 'reports', label: 'Reports', icon: AlertTriangle, component: <ReportsTab /> },
        { value: 'feedback', label: 'Feedback', icon: LifeBuoy, component: <FeedbackTab /> },
        { value: 'settings', label: 'App Settings', icon: Settings, component: <SettingsTab /> },
        { value: 'intel', label: 'Intel', icon: Globe, component: <IntelTab /> },
        { value: 'transport', label: 'Transport', icon: Train, component: <TransportTab /> },
        { value: 'eco-intel', label: 'Eco-Intel', icon: Leaf, component: <EcoIntelTab /> },
        { value: 'financial', label: 'Financial', icon: LineChart, component: <FinancialTab /> },
        { value: 'tokens', label: 'Tokens', icon: Coins, component: <TokensTab /> },
        { value: 'language-packs', label: 'Language Packs', icon: Music, component: <LanguagePacksTab /> },
        { value: 'bulk-actions', label: 'Bulk Actions', icon: Trash2, component: <BulkActionsTab /> },
        { value: 'messaging', label: 'Messaging', icon: MessageSquareQuote, component: <MessagingTab /> },
    ];
    
    return (
        <div className="space-y-8">
            <MainHeader 
                title="Admin Dashboard" 
                description="Manage users and app settings."
                titleIcon={<AdminInfoDialog />} 
            />
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <ScrollArea className="w-full whitespace-nowrap" orientation="horizontal">
                    <TabsList>
                        {adminTabs.map(tab => (
                            <TabsTrigger key={tab.value} value={tab.value} className="flex-row items-center gap-2 p-2">
                                <tab.icon className="h-5 w-5" />
                                <span>{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </ScrollArea>

                <div className="mt-6">
                    <Suspense fallback={<LoadingFallback />}>
                        {adminTabs.map(tab => (
                            <TabsContent key={tab.value} value={tab.value}>
                                {activeTab === tab.value ? tab.component : null}
                            </TabsContent>
                        ))}
                    </Suspense>
                </div>
            </Tabs>
        </div>
    );
}
