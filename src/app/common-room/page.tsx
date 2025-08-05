
"use client";

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserData } from '@/context/UserDataContext';
import { LoaderCircle } from 'lucide-react';
import CommonRoomClient from './CommonRoomClient';
import MainHeader from '@/components/layout/MainHeader';

export default function CommonRoomPage() {
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
            <MainHeader title="The Common Room" description="Share stories, ask questions, and connect with fellow travelers." />
            <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
                <CommonRoomClient />
            </Suspense>
        </div>
    );
}
