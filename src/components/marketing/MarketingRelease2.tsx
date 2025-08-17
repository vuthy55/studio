
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ArrowRight, MessageSquare, Mic, Users, Award, Shield } from 'lucide-react';
import { useUserData } from '@/context/UserDataContext';

// Restored Marketing Component
export default function MarketingRelease2() {
  const { user, settings } = useUserData();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const ctaLink = isClient && user ? "/learn" : "/login";

  return (
    <div className="space-y-12 text-lg">
      <header className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-primary font-headline">Don't Just Travel. Connect.</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">VibeSync is your all-in-one tool to break language barriers and make real connections on your travels.</p>
        <Button size="lg" asChild>
          <Link href={ctaLink}>Get Started & Earn Free Tokens <ArrowRight className="ml-2"/></Link>
        </Button>
      </header>
    </div>
  );
}
