
"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUserData } from '@/context/UserDataContext';
import { LoaderCircle, User as UserIcon, Wallet, CreditCard, Users, MessageSquareHeart } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainHeader from '@/components/layout/MainHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Import the new modular components
import ProfileSection from './components/ProfileSection';
import BuddiesSection from './components/BuddiesSection';
import WalletTab from './components/WalletTab';
import BillingTab from './components/BillingTab';
import ReferralsTab from './components/ReferralsTab';


function ProfilePageContent() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams, activeTab]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        router.push(`/profile?tab=${value}`, { scroll: false });
    }

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    const profileTabs = [
        { value: 'profile', label: 'Profile', icon: UserIcon },
        { value: 'buddies', label: 'Buddies', icon: Users },
        { value: 'wallet', label: 'Token Wallet', icon: Wallet },
        { value: 'billing', label: 'Payment History', icon: CreditCard },
        { value: 'referrals', label: 'Referrals', icon: MessageSquareHeart }
    ];

    return (
        <div className="space-y-8">
            <MainHeader title="My Account" description="Manage settings and track your history." />
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="grid w-full grid-cols-5">
                    <TabsList className="col-span-5 grid h-auto w-full grid-cols-5">
                        {profileTabs.map((tab) => (
                           <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col items-center justify-center gap-1 py-2 h-full md:flex-row md:gap-2">
                               <TooltipProvider delayDuration={0}>
                                   <Tooltip>
                                       <TooltipTrigger asChild>
                                           <tab.icon className="h-5 w-5" />
                                       </TooltipTrigger>
                                       <TooltipContent side="bottom" className="md:hidden">
                                           <p>{tab.label}</p>
                                       </TooltipContent>
                                   </Tooltip>
                               </TooltipProvider>
                               <span className="hidden text-sm md:inline">{tab.label}</span>
                           </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                
                <TabsContent value="profile" className="mt-6">
                    <ProfileSection />
                </TabsContent>
                <TabsContent value="buddies" className="mt-6">
                    <BuddiesSection />
                </TabsContent>
                 <TabsContent value="wallet" className="mt-6">
                    <WalletTab />
                </TabsContent>
                 <TabsContent value="billing" className="mt-6">
                    <BillingTab />
                </TabsContent>
                <TabsContent value="referrals" className="mt-6">
                    <ReferralsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function ProfilePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <ProfilePageContent />
        </Suspense>
    );
}
