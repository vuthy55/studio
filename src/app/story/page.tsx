
"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import MainHeader from '@/components/layout/MainHeader';

export default function StoryPage() {
  return (
    <div className="space-y-8">
      <MainHeader title="A Traveler's Story" description="How VibeSync connects people across cultures." />
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
          <div>
            <Image 
                src="https://images.unsplash.com/photo-1528260346029-9a8b27441463?q=80&w=2070&auto=format&fit=crop"
                alt="A solo male backpacker looking lost in a bustling Asian market. Source: https://images.unsplash.com/photo-1528260346029-9a8b27441463?q=80&w=2070&auto=format&fit=crop"
                width={600}
                height={400}
                className="rounded-lg shadow-xl object-cover aspect-[3/2]"
                unoptimized
                data-ai-hint="backpacker market"
            />
            <p className="text-xs text-muted-foreground mt-1">Image Source: https://unsplash.com/photos/a-man-with-a-backpack-walking-through-a-market-1528260346029-9a8b27441463</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <Image 
                src="https://images.unsplash.com/photo-1574068468668-a05a11f871da?q=80&w=1974&auto=format&fit=crop"
                alt="Traveler confidently ordering street food. Source: https://images.unsplash.com/photo-1574068468668-a05a11f871da?q=80&w=1974&auto=format&fit=crop"
                width={600}
                height={400}
                className="rounded-lg shadow-xl object-cover aspect-[3/2] md:order-2"
                unoptimized
                data-ai-hint="ordering food"
            />
            <p className="text-xs text-muted-foreground mt-1 md:text-right">Image Source: https://unsplash.com/photos/a-man-standing-in-front-of-a-food-stand-1574068468668-a05a11f871da</p>
          </div>
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
           <div>
            <Image 
                src="https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop"
                alt="A diverse group of young friends laughing together at a landmark. Source: https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop"
                width={600}
                height={400}
                className="rounded-lg shadow-xl object-cover aspect-[3/2]"
                unoptimized
                data-ai-hint="diverse friends"
            />
            <p className="text-xs text-muted-foreground mt-1">Image Source: https://unsplash.com/photos/a-group-of-people-standing-on-top-of-a-building-1542037104-91ad67d9692a</p>
          </div>
        </div>

         <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <Image 
                src="https://images.unsplash.com/photo-1516589178581-6e3a4f11413a?q=80&w=2070&auto=format&fit=crop"
                alt="A group of people looking at a phone together and planning. Source: https://images.unsplash.com/photo-1516589178581-6e3a4f11413a?q=80&w=2070&auto=format&fit=crop"
                width={600}
                height={400}
                className="rounded-lg shadow-xl object-cover aspect-[3/2] md:order-2"
                unoptimized
                data-ai-hint="friends phone"
            />
            <p className="text-xs text-muted-foreground mt-1 md:text-right">Image Source: https://unsplash.com/photos/a-group-of-people-looking-at-a-cell-phone-1516589178581-6e3a4f11413a</p>
          </div>
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
    </div>
  );
}
