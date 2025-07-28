
"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, AlertTriangle, Mic, RadioTower, Users, Award, Coins, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useUserData } from '@/context/UserDataContext';

export default function MarketingRelease2() {
  const { user } = useUserData();
  const prepVibeLink = user ? "/synchub?tab=prep-vibe" : "/login";
  const syncLiveLink = user ? "/synchub?tab=sync-live" : "/login";
  const syncOnlineLink = user ? "/synchub?tab=sync-online" : "/login";
  const adventureLink = user ? "/synchub" : "/login";

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-4 prose prose-sm prose-headings:font-bold prose-headings:text-primary prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground">
      
      <header className="text-center not-prose">
        <h1 className="text-4xl font-bold text-primary font-headline">From Lost in Translation to Found in Connection</h1>
        <p className="text-lg text-muted-foreground mt-2">One Traveler's Journey with VibeSync in Cambodia</p>
      </header>
      
      <figure className="not-prose">
        <Image 
            src="https://images.unsplash.com/photo-1559592233-b36a13127883?q=80&w=2070&auto=format&fit=crop"
            alt="A solo traveler looking out over a temple in Cambodia"
            width={800}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[2/1] w-full"
            unoptimized
            data-ai-hint="solo traveler cambodia"
        />
        <figcaption className="text-center text-xs text-muted-foreground mt-2">Alex arriving in Cambodia, ready for adventure but daunted by the language barrier.</figcaption>
      </figure>

      <section>
        <h3>The Challenge: A Wall of Words</h3>
        <p>
          Alex, a solo traveler, arrived in Siem Reap with a heart full of adventure. The vibrant streets, the smell of street food, the ancient temples... it was everything they had dreamed of. But there was one problem: the Khmer language sounded like a beautiful but impenetrable wall. Simple tasks felt like monumental challenges. A feeling of isolation began to creep in. How could they truly connect with this amazing culture if they couldn't even say "hello" properly?
        </p>
      </section>

      <section>
        <h3>The Discovery: A Vibe of Hope</h3>
        <p>
          While scrolling through a travel forum at a local café, Alex discovered VibeSync. The promise was simple: "Speak Their Language. Share Your Vibe." Intrigued and a bit desperate, they downloaded it, receiving a welcome bonus of 100 free tokens. The journey was about to change.
        </p>
      </section>

      <section>
        <h3>Step 1: The First Words with 'Prep Your Vibe'</h3>
        <p>
          Before leaving the café, Alex opened the <strong><Link href={prepVibeLink}>Prep Your Vibe</Link></strong> feature. They started with the 'Greetings' and 'Numbers' topics. Within minutes, they were practicing "Sues'day" (Hello) and learning to count. The app's pronunciation guide and practice tool were addictive. Even better, they earned a few extra tokens for mastering the phrases!
        </p>
      </section>
      
      <figure className="not-prose">
        <Image 
            src="https://images.unsplash.com/photo-1528271537-646763841974?q=80&w=2070&auto=format&fit=crop"
            alt="A friendly homestay owner in Cambodia"
            width={800}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[2/1] w-full"
            unoptimized
            data-ai-hint="cambodian homestay"
        />
        <figcaption className="text-center text-xs text-muted-foreground mt-2">Breaking the ice at the local homestay.</figcaption>
      </figure>

      <section>
        <h3>Step 2: Breaking the Ice at the Homestay</h3>
        <p>
          Armed with newfound confidence, Alex arrived at their homestay. The owner greeted them with a warm smile. Alex took a deep breath and said, "Sues'day!" The owner's smile widened. A connection was made.
        </p>
        <p>
          When it was time to pay, Alex used the <strong><Link href={syncLiveLink}>Live Translation</Link></strong> feature. They typed "How much for two nights?" and showed the Khmer translation to the owner. The owner pointed to a price. Alex, using the numbers they just learned, confirmed the payment in Khmer. It was a small victory, but it felt huge. Later, they used the same feature to ask, "Can you please book a tuk-tuk for Angkor Wat tomorrow?" The tuk-tuk was arranged in seconds. No confusion, no stress.
        </p>
      </section>
      
      <figure className="not-prose">
        <Image 
            src="https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop"
            alt="A group of diverse young travelers laughing together"
            width={800}
            height={400}
            className="rounded-lg shadow-xl object-cover aspect-[2/1] w-full"
            unoptimized
            data-ai-hint="diverse travelers laughing"
        />
        <figcaption className="text-center text-xs text-muted-foreground mt-2">New friends made at the temple, thanks to a little help from VibeSync.</figcaption>
      </figure>

      <section>
        <h3>Step 3: From Solo to Social with 'Sync Live'</h3>
        <p>
          At the temples, Alex met a group of fellow travelers—Aisha from Malaysia, Zoya from Egypt, and Linh from Vietnam. They were all trying to communicate with a mix of gestures and broken English. Seeing the struggle, Alex pulled out their phone and opened <strong><Link href={syncLiveLink}>Sync Live</Link></strong>.
        </p>
        <p>
          They selected Malay, Arabic, and Vietnamese. "Hi, my name is Alex. Where are you all from?" they said into the phone. VibeSync spoke the sentence out loud in all three languages. The girls' eyes lit up. One by one, they answered, and Alex's phone translated back. The initial awkwardness melted away into laughter and shared stories. The language wall had crumbled.
        </p>
      </section>

      <section>
        <h3>Step 4: Keeping the Vibe Alive with 'Sync Online'</h3>
        <p>
          The group became inseparable for the rest of their time in Siem Reap. When they eventually had to part ways, they promised to keep in touch. This is where <strong><Link href={syncOnlineLink}>Sync Online</Link></strong> became their lifeline.
        </p>
        <p>
          Alex created a private chat room. Now, from their respective new locations—a beach in Thailand, a market in Hanoi, a cafe in Cairo—they could all talk. Aisha would speak in Malay, Linh in Vietnamese, and Zoya in Arabic, but everyone heard the conversation in their own native language. They weren't just sending texts; they were sharing real-time experiences, planning their next reunion. VibeSync had transformed a chance meeting into a lasting global friendship.
        </p>
      </section>
      
      <section className="text-center not-prose border-t pt-8">
        <h2 className="text-3xl font-bold">Your Story is Waiting.</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">VibeSync isn't just an app; it's your key to unlocking a world of connection. Download it today and start writing your own adventure.</p>
        <Button size="lg" variant="default" asChild className="mt-4">
            <Link href={adventureLink}>Start Your Adventure & Get Free Tokens</Link>
        </Button>
      </section>
    </div>
  );
}
