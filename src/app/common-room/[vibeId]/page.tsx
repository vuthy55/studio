
"use client";

import React, { Suspense, useEffect } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter, useParams } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import VibeDetailClient from './VibeDetailClient';

function VibeDetailPageContainer() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const params = useParams();
    const vibeId = params.vibeId as string;

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading]);

    if (authLoading || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return <VibeDetailClient vibeId={vibeId} />;
}

export default function VibeDetailPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <VibeDetailPageContainer />
        </Suspense>
    );
}
