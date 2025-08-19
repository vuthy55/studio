
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is deprecated and now redirects to the new location.
export default function DeprecatedEcoFootprintPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/infohub?tab=footprints');
    }, [router]);

    return null;
}
