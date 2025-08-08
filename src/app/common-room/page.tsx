"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// This page is now a temporary redirector.
// It will send users to the new /connect page.
export default function CommonRoomRedirectPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        // Preserve any query parameters, like 'from' or 'reportId'
        const params = new URLSearchParams(searchParams.toString());
        router.replace(`/connect?${params.toString()}`);
    }, [router, searchParams]);

    // You can show a loading spinner here if you want
    return null;
}
