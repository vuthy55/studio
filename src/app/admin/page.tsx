
"use client";

import React, { Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from "lucide-react";
import AdminPageV2 from './AdminPageV2';
import { useUserData } from '@/context/UserDataContext';


export default function AdminPage() {
    const { user, loading, userProfile } = useUserData();
    const router = useRouter();
    
    useEffect(() => {
        if (!loading && (!user || userProfile?.role !== 'admin')) {
            router.push('/login');
        }
    }, [user, loading, userProfile, router]);
    
    if (loading || !user || userProfile?.role !== 'admin') {
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
    
