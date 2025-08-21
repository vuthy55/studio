

"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUserData } from '@/context/UserDataContext';
import { LoaderCircle, User as UserIcon, Wallet, CreditCard, Users, MessageSquareHeart, BarChart, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainHeader from '@/components/layout/MainHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';


// Dynamically import the tab components
const ProfileSection = React.lazy(() => import('./components/ProfileSection'));
const BuddiesSection = React.lazy(() => import('./components/BuddiesSection'));
const WalletTab = React.lazy(() => import('./components/WalletTab'));
const BillingTab = React.lazy(() => import('./components/BillingTab'));
const ReferralsTab = React.lazy(() => import('./components/ReferralsTab'));
const StatsTab = React.lazy(() => import('./components/StatsTab'));


function ProfileInfoDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>About Your Profile Sections</DialogTitle>
                    <DialogDescription>Here's a guide to managing your account and tracking your progress.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4 py-4 text-sm">
                        <div>
                            <h4 className="font-semibold mb-1">Profile</h4>
                            <p className="text-muted-foreground">
                                This is your main account page. Update your name, country, and default spoken language. You can also find account management options in the "Danger Zone," including the ability to reset practice stats or delete your account.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Stats</h4>
                            <p className="text-muted-foreground">
                                Track your language learning journey. This tab shows your overall performance and accuracy for each language you've practiced in the "Learn" section. Click on any language to see a detailed, phrase-by-phrase breakdown of your history.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">Buddies</h4>
                            <p className="text-muted-foreground">
                                Manage your social connections. Find and add new friends by email. Accept incoming friend requests, and manage your high-trust "Buddy Alert" list for the safety feature.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Token Wallet</h4>
                            <p className="text-muted-foreground">
                                Manage your VibeSync tokens. View your current balance, buy more tokens using PayPal, transfer tokens to other users, and view a complete history of all your token transactions.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Payment History</h4>
                            <p className="text-muted-foreground">
                               This tab provides a clear record of all your real-money transactions, including token purchases and any donations you've made.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold mb-1">Referrals</h4>
                            <p className="text-muted-foreground">
                                Find your unique referral link here. Share it with friends, and when they sign up, you'll both receive a generous token bonus. This section also lists all the users who have successfully signed up using your link.
                            </p>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button>Got it!</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ProfilePageContent() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');

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
        { value: 'profile', label: 'Profile', icon: UserIcon, component: <ProfileSection /> },
        { value: 'stats', label: 'Stats', icon: BarChart, component: <StatsTab /> },
        { value: 'buddies', label: 'Buddies', icon: Users, component: <BuddiesSection /> },
        { value: 'wallet', label: 'Token Wallet', icon: Wallet, component: <WalletTab /> },
        { value: 'billing', label: 'Payment History', icon: CreditCard, component: <BillingTab /> },
        { value: 'referrals', label: 'Referrals', icon: MessageSquareHeart, component: <ReferralsTab /> }
    ];

    return (
        <div className="space-y-8">
            <MainHeader 
                title="My Profile" 
                description="Manage settings and track your history."
                titleIcon={<ProfileInfoDialog />}
            />
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="grid w-full grid-cols-6">
                    <TabsList className="col-span-6 grid h-auto w-full grid-cols-6">
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
                <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                    {profileTabs.map((tab) => (
                        <TabsContent key={tab.value} value={tab.value} className="mt-6">
                            {activeTab === tab.value && tab.component}
                        </TabsContent>
                    ))}
                </Suspense>
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
