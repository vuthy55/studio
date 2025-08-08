"use client";

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { LoaderCircle } from 'lucide-react';
import LiveTranslationContent from '@/components/synchub/LiveTranslationContent';
import { useUserData } from '@/context/UserDataContext';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';

function TranslatorPageContainer() {
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
            <MainHeader title="Translator" description="A simple utility for translating typed or spoken text from a source to a target language." />
            <LiveTranslationContent />
        </div>
    );
}

export default function TranslatorPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <TourProvider>
                <TranslatorPageContainer />
                <Tour />
            </TourProvider>
        </Suspense>
    );
}
