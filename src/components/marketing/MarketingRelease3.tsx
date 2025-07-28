
"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

export default function MarketingRelease3() {
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
        <Image 
            src="https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop"
            alt="A solo traveler looking a bit lost in a bustling Asian market"
            width={600}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[3/2]"
            data-ai-hint="confused traveler"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-center">
         <Image 
            src="https://images.unsplash.com/photo-1528271537-646763841974?q=80&w=2070&auto=format&fit=crop"
            alt="Traveler confidently ordering street food"
            width={600}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[3/2] md:order-2"
            data-ai-hint="ordering street food"
        />
        <div className="space-y-4 md:order-1">
            <h2 className="text-3xl font-bold">The Fix: From Clueless to Confident</h2>
            <p className="text-muted-foreground">
                Back at the hostel, Alex finds VibeSync. The "Prep Your Vibe" feature is a game-changer. In ten minutes, they've nailed the basics: "Sues'day" (Hello), "Arkoun" (Thank You), and how to count. That night, they confidently order street food and pay the right price. Small win? Huge win.
            </p>
            <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/synchub?tab=prep-vibe">Try Prep Your Vibe <ArrowRight className="ml-2 h-4 w-4" /></Link>
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
                 <Link href="/synchub?tab=sync-live">Check out Sync Live <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
        </div>
        <Image 
            src="https://images.unsplash.com/photo-1559592233-b36a13127883?q=80&w=2070&auto=format&fit=crop"
            alt="A diverse group of young friends laughing together at a landmark"
            width={600}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[3/2]"
            data-ai-hint="diverse friends travel"
        />
      </div>

       <div className="grid md:grid-cols-2 gap-8 items-center">
        <Image 
            src="https://images.unsplash.com/photo-1501555088652-021faa106b9b?q=80&w=2073&auto=format&fit=crop"
            alt="A group of people looking at a phone together and planning"
            width={600}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[3/2] md:order-2"
            data-ai-hint="friends phone travel"
        />
        <div className="space-y-4 md:order-1">
            <h2 className="text-3xl font-bold">The Vibe: Staying in Sync</h2>
            <p className="text-muted-foreground">
                The trip ends, but the friendship doesn't. Using "Sync Online," the group chats from different countries. Aisha speaks Malay, Linh speaks Vietnamese, but everyone hears the conversation in their own language. They're planning their next adventure, already.
            </p>
            <Button variant="link" asChild className="p-0 h-auto">
                 <Link href="/synchub?tab=sync-online">See how Sync Online works <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
        </div>
      </div>
      
      <section className="text-center border-t pt-12 space-y-4">
        <h2 className="text-3xl font-bold">Your turn.</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">Stop just seeing the world. Start connecting with it.</p>
        <Button size="lg" variant="default" asChild>
            <Link href="/login">Start Your Adventure & Get Free Tokens</Link>
        </Button>
      </section>
    </div>
  );
}
