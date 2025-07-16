
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { LoaderCircle } from "lucide-react";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

export default function ProfilePage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);


    if (loading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (error) {
        return <p>Error: {error.message}</p>;
    }
    
    if (!user) {
        // This state is briefly hit before the redirect useEffect kicks in.
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
                 <p className="ml-4">Redirecting...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isMobile && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Profile</h1>
                        <p className="text-muted-foreground">Manage your account settings and track your progress.</p>
                    </div>
                </div>
            </header>
            <div>
              <p>Welcome, {user.displayName || user.email}!</p>
              <p>Profile features are coming soon.</p>
            </div>
        </div>
    );
}
