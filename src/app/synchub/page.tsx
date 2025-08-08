
"use client";

import { memo, Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserData } from '@/context/UserDataContext';
import { LoaderCircle } from 'lucide-react';

// This page is now just a redirector.
// It will send users to the new /learn page by default.
export default function SyncHubRedirectPage() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading) {
            if (user) {
                router.replace('/learn');
            } else {
                router.replace('/login');
            }
        }
    }, [user, authLoading, router]);

    return (
        <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
            <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
}
