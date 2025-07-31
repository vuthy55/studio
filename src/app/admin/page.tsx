

"use client";

import React, { Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from "lucide-react";
import AdminPageV2 from './AdminPageV2';


export default function AdminPage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const [isClient, setIsClient] = React.useState(false);
    
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    React.useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);
    
    if (authLoading || !isClient) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <AdminPageV2 />
        </Suspense>
    );
}
    
