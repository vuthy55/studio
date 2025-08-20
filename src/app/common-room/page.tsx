
"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page has been consolidated into the /connect page.
// This component now acts as a redirect to the new, correct location.
export default function CommonRoomRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/connect');
    }, [router]);

    return null; // Render nothing as the redirect will happen immediately
}
