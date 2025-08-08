

"use client";

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoaderCircle, RadioTower, Users, Settings, Coins, MessageSquareQuote, Info, BellOff, Music, RefreshCw, LifeBuoy, Webhook, Globe, Bot, ChevronRight, Database, CheckCircle2, MessageSquare, LineChart, Trash2, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainHeader from '@/components/layout/MainHeader';

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

const LoadingFallback = () => (
    <div className="flex justify-center items-center py-10">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
);


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
        { value: 'financial', label: 'Financial', icon: LineChart, component: <FinancialTab /> },
        { value: 'tokens', label: 'Tokens', icon: Coins, component: <TokensTab /> },
        { value: 'language-packs', label: 'Language Packs', icon: Music, component: <LanguagePacksTab /> },
        { value: 'bulk-actions', label: 'Bulk Actions', icon: Trash2, component: <BulkActionsTab /> },
        { value: 'messaging', label: 'Messaging', icon: MessageSquareQuote, component: <MessagingTab /> },
    ];
    
    return (
        <div className="space-y-8">
            <MainHeader title="Admin Dashboard" description="Manage users and app settings." />
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-5 md:grid-cols-11 h-auto">
                    {adminTabs.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-2 h-full">
                            <tab.icon className="h-5 w-5" />
                            <span className="hidden md:inline">{tab.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>

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
