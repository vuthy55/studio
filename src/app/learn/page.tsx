
"use client";

import { Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import LearnPageClient from './LearnPageClient';


export default function LearnPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <LearnPageClient />
        </Suspense>
    );
}
