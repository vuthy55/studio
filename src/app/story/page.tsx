
"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ArrowRight, Backpack, UtensilsCrossed, Users, MessageSquare } from 'lucide-react';
import MainHeader from '@/components/layout/MainHeader';
import { useUserData } from '@/context/UserDataContext';

export default function StoryPage() {
  const { user, settings } = useUserData();
  
  const learnLink = user ? "/learn" : "/login";
  const converseLink = user ? "/converse" : "/login";
  const connectLink = user ? "/connect" : "/login";
  const adventureLink = user ? "/connect" : "/login";

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
          <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-xl aspect-[3/2]">
            <Backpack className="h-32 w-32 text-primary" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="md:order-2">
            <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-xl aspect-[3/2]">
                 <UtensilsCrossed className="h-32 w-32 text-primary" />
            </div>
          </div>
          <div className="md:order-1 space-y-4">
              <h2 className="text-3xl font-bold">The Fix: From Clueless to Confident</h2>
              <p className="text-muted-foreground">
                  Back at the hostel, Alex finds VibeSync. The "Learn" feature is a game-changer. In ten minutes, they've nailed the basics: "Sues'day" (Hello), "Arkoun" (Thank You), and how to count. That night, they confidently order street food and pay the right price. Small win? Huge win.
              </p>
              <Button variant="link" asChild className="p-0 h-auto">
                  <Link href={learnLink}>Try the Learn Feature <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
              <h2 className="text-3xl font-bold">The Connection: Breaking the Ice</h2>
              <p className="text-muted-foreground">
                  At Angkor Wat, Alex meets a crew from Malaysia, Egypt, and Vietnam. The vibe is cool, but conversation is stuck on gestures. Alex opens "Converse," speaks, and the phone translates for everyone. The awkward silence shatters into laughter. Later, they add each other as buddies in the app for an extra layer of safety.
              </p>
              <Button variant="link" asChild className="p-0 h-auto">
                   <Link href={converseLink}>Check out Converse <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
          </div>
           <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-xl aspect-[3/2]">
             <Users className="h-32 w-32 text-primary" />
          </div>
        </div>

         <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="md:order-2">
            <div className="flex items-center justify-center p-4 md:p-8 bg-muted rounded-lg shadow-xl aspect-[3/2]">
                 <MessageSquare className="h-32 w-32 text-primary" />
            </div>
          </div>
          <div className="space-y-4 md:order-1">
              <h2 className="text-3xl font-bold">The Community: Finding Your People</h2>
              <p className="text-muted-foreground">
                  The trip continues, but now Alex isn't just a tourist; they're part of a community. Using the "Connect" feature, they join multi-lingual "Chatz" to swap tips about secret waterfalls, and even find a "Meetup" with other VibeSync users for a night market tour in the next city. The app isn't just for translation; it's for finding your crew on the road.
              </p>
              <Button variant="link" asChild className="p-0 h-auto">
                   <Link href={connectLink}>Explore the Connect Hub <ArrowRight className="ml-2 h-4 w-4" /></Link>
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
    </div>
  );
}
