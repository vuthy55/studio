
"use client";

import React, { Suspense } from 'react';
import { LoaderCircle } from "lucide-react";
import AdminPageClient from './AdminPageClient';

export default function AdminPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <AdminPageClient />
        </Suspense>
    );
}
