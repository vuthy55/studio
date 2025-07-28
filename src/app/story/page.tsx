"use client";

import React from 'react';
import MarketingRelease3 from '@/components/marketing/MarketingRelease3';
import MainHeader from '@/components/layout/MainHeader';

export default function StoryPage() {
    return (
        <div className="space-y-8">
            <MainHeader title="A Traveler's Story" description="How VibeSync connects people across cultures." />
            <MarketingRelease3 />
        </div>
    )
}
