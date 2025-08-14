
"use client";

import React from 'react';
import './globals.css';
import MainHeader from '@/components/layout/MainHeader';
import MarketingRelease from '@/components/marketing/MarketingRelease';


export default function Homepage() {
    return (
        <div className="space-y-8">
            <MainHeader title="Welcome to VibeSync" description="The essential app for backpackers in Southeast Asia." />
            <MarketingRelease />
        </div>
    )
}
