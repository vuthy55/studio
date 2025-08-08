
"use client";

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle } from 'lucide-react';
import SyncLiveContent from '@/components/synchub/SyncLiveContent';
import { useUserData } from '@/context/UserDataContext';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';


function ConversePageContent() {
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
        <div className="space-y-8">
            <MainHeader title="Converse" description="Have a 1-on-1 conversation with anyone. Speak in your language, and the app translates for you." />
            <SyncLiveContent />
        </div>
    );
}


export default function ConversePage() {
     return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <TourProvider>
                <ConversePageContent />
                <Tour />
            </TourProvider>
        </Suspense>
    );
}
