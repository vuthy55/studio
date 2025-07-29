
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, AlertTriangle, Mic, RadioTower, Users, Award, Coins, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useUserData } from '@/context/UserDataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { useToast } from '@/hooks/use-toast';
import { Label } from '../ui/label';

function ReferralDialog({ settings, user }: { settings: any; user: any }) {
    const { toast } = useToast();
    const referralLink = `${window.location.origin}/login?ref=${user.uid}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(referralLink);
        toast({ title: "Copied!", description: "Referral link copied to clipboard." });
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button size="lg" className="mt-4">Refer and Get {settings.referralBonus} Free Tokens!</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Share Your Referral Link</DialogTitle>
                    <DialogDescription>
                        Share this link with your friends. When they sign up, you'll both get a bonus!
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="referral-link">Your unique link</Label>
                    <div className="flex items-center space-x-2">
                        <Input id="referral-link" value={referralLink} readOnly />
                        <Button type="button" size="icon" onClick={copyToClipboard}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}


export default function MarketingRelease() {
    const { user, settings } = useUserData();
    
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="text-center p-8 bg-primary/10 rounded-lg">
        <h1 className="text-5xl font-bold text-primary font-headline">VibeSync</h1>
        <p className="text-xl text-muted-foreground mt-2">Speak Their Language. Share Your Vibe.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
            <h2 className="text-3xl font-bold">Never Get Lost in Translation Again.</h2>
            <p className="text-muted-foreground">
                Don't just travel, connect! VibeSync is the essential, all-in-one app for backpackers in Southeast Asia. Master essential phrases, get instant voice translations, and have real-time conversations with locals, no matter the language barrier.
            </p>
            <p className="text-muted-foreground">
                From ordering street food in Siem Reap to finding your hostel in Kuala Lumpur, VibeSync is the only tool you need to travel safer, smarter, and make unforgettable connections.
            </p>
            {user && settings ? (
                <ReferralDialog settings={settings} user={user} />
            ) : (
                <Button size="lg" className="mt-4" asChild>
                    <Link href="/login">Register Now & Get {settings?.signupBonus || 100} Free Tokens!</Link>
                </Button>
            )}
        </div>
        <div>
            <Image 
                src="https://images.unsplash.com/photo-1501555088652-021faa106b9b?q=80&w=2073&auto=format&fit=crop"
                alt="Backpackers enjoying a scenic view"
                width={600}
                height={400}
                className="rounded-lg shadow-xl object-cover aspect-[3/2]"
                unoptimized
                data-ai-hint="backpackers travel"
            />
        </div>
      </div>

      <Card>
        <CardHeader>
            <CardTitle className="text-center text-3xl">Your Ultimate Travel Companion</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href={user ? "/synchub?tab=prep-vibe" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <Share2 className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Prep Your Vibe</h3>
                    <p className="text-sm text-muted-foreground">Master key phrases before you go. Earn free tokens just for practicing!</p>
                </div>
            </Link>
             <Link href={user ? "/profile?tab=buddies" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <AlertTriangle className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Buddy Alert</h3>
                    <p className="text-sm text-muted-foreground">Add friends and send your location to the group for extra peace of mind. A safety net, powered by your friends.</p>
                </div>
            </Link>
             <Link href={user ? "/synchub?tab=sync-live" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <Mic className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Sync Live</h3>
                    <p className="text-sm text-muted-foreground">Have a 1-on-1 chat with anyone. Speak in your language, and the app translates for you.</p>
                </div>
            </Link>
             <Link href={user ? "/synchub?tab=sync-online" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <RadioTower className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Sync Online</h3>
                    <p className="text-sm text-muted-foreground">Create group chat rooms where everyone hears the conversation in their own language.</p>
                </div>
            </Link>
             <Link href={user ? "/synchub?tab=prep-vibe" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <Award className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Earn As You Learn</h3>
                    <p className="text-sm text-muted-foreground">Start with 100 free tokens! Earn more by practicing and referring friends.</p>
                </div>
            </Link>
             <Link href={user ? "/profile?tab=wallet" : "/login"} className="block hover:scale-105 transition-transform duration-200">
                <div className="flex flex-col items-center text-center p-4 space-y-2 border rounded-lg h-full">
                    <Coins className="h-12 w-12 text-primary" />
                    <h3 className="font-semibold text-lg">Affordable Tokens</h3>
                    <p className="text-sm text-muted-foreground">Need more? Top up your balance easily. Packs start at just $5 for 500 tokens.</p>
                </div>
            </Link>
        </CardContent>
      </Card>
      
       <div className="text-center space-y-4 p-8">
            <h2 className="text-3xl font-bold">Your Adventure is Waiting.</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Don't let language be a barrier. Get the app, get the tokens, get talking!</p>
            <Button size="lg" variant="secondary" asChild>
                <Link href="/story">Read Our Story</Link>
            </Button>
      </div>

    </div>
  );
}
