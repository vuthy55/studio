
"use client";

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserData } from '@/context/UserDataContext';
import { LoaderCircle } from 'lucide-react';
import CommonRoomClient from './CommonRoomClient';
import MainHeader from '@/components/layout/MainHeader';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';

function CommonRoomPageContent() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') || 'public-vibes';


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
    return <CommonRoomClient initialTab={initialTab} />;
}


export default function CommonRoomPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <TourProvider>
                <CommonRoomPageContent />
                <Tour/>
            </TourProvider>
        </Suspense>
    );
}
