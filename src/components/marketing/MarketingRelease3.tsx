

"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Map, MessageSquarePlus, Users, Globe } from 'lucide-react';
import { useUserData } from '@/context/UserDataContext';

export default function MarketingRelease3() {
  const { user } = useUserData();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const prepVibeLink = isClient && user ? "/learn" : "/login";
  const syncLiveLink = isClient && user ? "/converse" : "/login";
  const syncOnlineLink = isClient && user ? "/connect?tab=voice-rooms" : "/login";
  const adventureLink = isClient && user ? "/connect" : "/login";

  return (
    <div className="space-y-12 text-lg">
      
      <header className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-primary font-headline">Lost for Words? Find Your Vibe.</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">The true story of how one app turned a solo trip into a global connection.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
            <h2 className="text-3xl font-bold">The Panic: Day 1 in Cambodia</h2>
            <p className="text-muted-foreground">
                Alex lands in Siem Reap. The energy is epic, but the language barrier is a brick wall. How do you even ask for a bottle of water? Pointing and smiling only gets you so far. The feeling of being totally alone starts to creep in.
            </p>
        </div>
        <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-inner aspect-video">
            <Map className="h-32 w-32 text-primary/70" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-inner aspect-video md:order-2">
            <MessageSquarePlus className="h-32 w-32 text-primary/70" />
        </div>
        <div className="space-y-4 md:order-1">
            <h2 className="text-3xl font-bold">The Fix: From Clueless to Confident</h2>
            <p className="text-muted-foreground">
                Back at the hostel, Alex finds VibeSync. The "Prep Your Vibe" feature is a game-changer. In ten minutes, they've nailed the basics: "Sues'day" (Hello), "Arkoun" (Thank You), and how to count. That night, they confidently order street food and pay the right price. Small win? Huge win.
            </p>
            <Button variant="link" asChild className="p-0 h-auto">
                <Link href={prepVibeLink}>Try Prep Your Vibe <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
            <h2 className="text-3xl font-bold">The Connection: Breaking the Ice</h2>
            <p className="text-muted-foreground">
                At Angkor Wat, Alex meets a crew from Malaysia, Egypt, and Vietnam. The vibe is cool, but conversation is stuck on gestures. Alex opens "Sync Live," speaks, and the phone translates for everyone. The awkward silence shatters into laughter. Suddenly, they're not strangers anymore.
            </p>
            <Button variant="link" asChild className="p-0 h-auto">
                 <Link href={syncLiveLink}>Check out Sync Live <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
        </div>
        <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-inner aspect-video">
            <Users className="h-32 w-32 text-primary/70" />
        </div>
      </div>

       <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-inner aspect-video md:order-2">
            <Globe className="h-32 w-32 text-primary/70" />
        </div>
        <div className="space-y-4 md:order-1">
            <h2 className="text-3xl font-bold">The Vibe: Staying in Sync</h2>
            <p className="text-muted-foreground">
                The trip ends, but the friendship doesn't. Using "Sync Online," the group chats from different countries. Aisha speaks Malay, Linh speaks Vietnamese, but everyone hears the conversation in their own language. They're planning their next adventure, already.
            </p>
            <Button variant="link" asChild className="p-0 h-auto">
                 <Link href={syncOnlineLink}>See how Sync Online works <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
        </div>
      </div>
      
      <section className="text-center border-t pt-12 space-y-4">
        <h2 className="text-3xl font-bold">Your turn.</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">Stop just seeing the world. Start connecting with it.</p>
        <Button size="lg" variant="default" asChild>
            <Link href={adventureLink}>Start Your Adventure & Get Free Tokens</Link>
        </Button>
      </section>
    </div>
  );
}
