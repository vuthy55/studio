
"use client";

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle } from 'lucide-react';
import { useUserData } from '@/context/UserDataContext';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';
import LearnPageContent from '@/components/synchub/LearnPageContent';


function LearnPageClient() {
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
        <TourProvider>
            <div className="space-y-8">
                <MainHeader title="Learn" description="Master essential phrases and translate on the fly." />
                <LearnPageContent />
            </div>
            <Tour />
        </TourProvider>
    );
}


export default function LearnPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <LearnPageClient />
        </Suspense>
    );
}
