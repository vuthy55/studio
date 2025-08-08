
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is now a temporary redirector.
// It will send users to the new /connect page.
export default function CommonRoomRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/connect?tab=chatz');
    }, [router]);

    // You can show a loading spinner here if you want
    return null;
}
