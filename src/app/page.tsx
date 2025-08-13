
"use client";

import React from 'react';
import MainHeader from '@/components/layout/MainHeader';
import MarketingRelease from '@/components/marketing/MarketingRelease';


export default function Homepage() {
    return (
        <div className="space-y-8">
            <div className="p-4 bg-yellow-300 text-black font-bold text-center">
                <h1 className="text-2xl">DEBUG: If you see this, the page content is updating.</h1>
            </div>
            <MainHeader title="Welcome to VibeSync" description="The essential app for backpackers in Southeast Asia." />
            <MarketingRelease />
        </div>
    )
}
