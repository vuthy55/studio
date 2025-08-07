
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoaderCircle, RadioTower, Users, Settings, Coins, MessageSquareQuote, Info, BellOff, Music, RefreshCw, LifeBuoy, Webhook, Globe, Bot, ChevronRight, Database, CheckCircle2, MessageSquare, LineChart, Trash2, AlertTriangle, Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainHeader from '@/components/layout/MainHeader';

// Import the new modular components
import RoomsTab from './RoomsTab';
import UsersTab from './UsersTab';
import FeedbackTab from './FeedbackTab';
import SettingsTab from './SettingsTab';
import IntelTab from './IntelTab';
import FinancialTab from './FinancialTab';
import TokensTab from './TokensTab';
import LanguagePacksTab from './LanguagePacksTab';
import BulkActionsTab from './BulkActionsTab';
import MessagingTab from './MessagingTab';
import ReportsTab from './ReportsTab';


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
        { value: 'rooms', label: 'Rooms', icon: RadioTower },
        { value: 'users', label: 'Users', icon: Users },
        { value: 'reports', label: 'Reports', icon: Shield },
        { value: 'feedback', label: 'Feedback', icon: LifeBuoy },
        { value: 'settings', label: 'App Settings', icon: Settings },
        { value: 'intel', label: 'Intel', icon: Globe },
        { value: 'financial', label: 'Financial', icon: LineChart },
        { value: 'tokens', label: 'Tokens', icon: Coins },
        { value: 'language-packs', label: 'Language Packs', icon: Music },
        { value: 'bulk-actions', label: 'Bulk Actions', icon: Trash2 },
        { value: 'messaging', label: 'Messaging', icon: MessageSquareQuote },
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
                    <TabsContent value="rooms"><RoomsTab /></TabsContent>
                    <TabsContent value="users"><UsersTab /></TabsContent>
                    <TabsContent value="reports"><ReportsTab /></TabsContent>
                    <TabsContent value="feedback"><FeedbackTab /></TabsContent>
                    <TabsContent value="settings"><SettingsTab /></TabsContent>
                    <TabsContent value="intel"><IntelTab /></TabsContent>
                    <TabsContent value="financial"><FinancialTab /></TabsContent>
                    <TabsContent value="tokens"><TokensTab /></TabsContent>
                    <TabsContent value="language-packs"><LanguagePacksTab /></TabsContent>
                    <TabsContent value="bulk-actions"><BulkActionsTab /></TabsContent>
                    <TabsContent value="messaging"><MessagingTab /></TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
