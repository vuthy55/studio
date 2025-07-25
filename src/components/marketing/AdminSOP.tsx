
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function AdminSOP() {
  return (
    <div className="space-y-6 text-sm">
      <p>
        This document outlines the standard operating procedures for managing the VibeSync application. It is intended for administrators to understand the app's features, economy, and management tools.
      </p>
      
      <Separator />

      <section>
        <h3 className="font-bold text-lg mb-2">1. Application Overview</h3>
        <p>
          VibeSync is a comprehensive mobile application designed for backpackers and travelers, primarily in Southeast Asia. It combines language learning, real-time translation, and communication tools to break down language barriers. The app operates on a "freemium" model, supported by a virtual token economy.
        </p>
      </section>

      <section>
        <h3 className="font-bold text-lg mb-2">2. Core Features</h3>
        <ul className="list-disc pl-5 space-y-3">
          <li>
            <strong>SyncHub - Main Dashboard:</strong>
            <ul className="list-circle pl-5 mt-1 space-y-1">
              <li><strong>Prep Your Vibe:</strong> The core language learning module. Users can practice phrases from various topics (greetings, food, etc.). Correctly practicing phrases earns them tokens.</li>
              <li><strong>Sync Live:</strong> A 1-to-many translation tool. A user speaks into their device, and the app translates and vocalizes the speech in up to four selected languages. This is ideal for 1-on-1 conversations where only one person has the app.</li>
              <li><strong>Live Translation:</strong> A simple utility for translating typed or spoken text from a source to a target language. Useful for quick, one-off translations.</li>
              <li><strong>Sync Online:</strong> A multi-user, real-time voice chat room with translation. Users can schedule rooms, invite others, and have a conversation where each participant hears the others in their own selected language.</li>
            </ul>
          </li>
          <li>
            <strong>User Account & Wallet:</strong>
            <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Profile Management:</strong> Users can update their name, country, and default language.</li>
                <li><strong>Token Wallet:</strong> Users can view their token balance, see transaction history, and purchase more tokens.</li>
                <li><strong>Referral System:</strong> Each user has a unique referral link. They earn a significant token bonus when a new user signs up using their link.</li>
                <li><strong>Buddy System & Alerts:</strong> A community-based safety feature. Users can add friends as "buddies" within the app. A "Buddy Alert" button sends an in-app notification with the user's current location to all their buddies for non-emergency situations.</li>
            </ul>
          </li>
        </ul>
      </section>
      
      <Separator />

      <section>
        <h3 className="font-bold text-lg mb-2">3. The Token Economy</h3>
        <p>The token system is designed to encourage engagement and provide a clear path to monetization for premium features.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Earning Tokens (Free Methods)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                        <li><strong>Signup Bonus:</strong> Automatically granted to every new user upon registration.</li>
                        <li><strong>Referral Bonus:</strong> Awarded to the referrer when a new user signs up via their link.</li>
                        <li><strong>Practice Rewards:</strong> Small token amounts awarded for mastering phrases in "Prep Your Vibe".</li>
                        <li><strong>Admin Issuance:</strong> Manually granted by admins for customer support, rewards, or testing.</li>
                    </ul>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Spending Tokens (App Usage)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                        <li><strong>Live Translation:</strong> A small, fixed cost per translation.</li>
                        <li><strong>Sync Live Usage:</strong> Billed per minute of active use, deducted from the user's free monthly allowance first, then from their token balance.</li>
                        <li><strong>Sync Online Room Creation:</strong> A pre-paid cost calculated based on the number of participants and the scheduled duration.</li>
                        <li><strong>P2P Transfers:</strong> Users can send tokens to other users.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
      </section>

       <section>
        <h3 className="font-bold text-lg mb-2">4. Pricing & Monetization</h3>
         <p>The primary direct revenue source is the sale of tokens via PayPal.</p>
         <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Standard Rate:</strong> $0.01 USD per token (e.g., 500 tokens for $5.00).</li>
            <li><strong>Package Deals:</strong> The app offers bonus tokens for larger purchases (e.g., buy 1000 tokens, get 200 free) to incentivize larger transactions.</li>
            <li><strong>Donations:</strong> Users can make direct monetary donations, also processed via PayPal.</li>
            <li><strong>Commissions:</strong> Future monetization can come from affiliate links for booking services (not yet implemented).</li>
         </ul>
      </section>
      
      <Separator />

      <section>
        <h3 className="font-bold text-lg mb-2">5. Admin Dashboard Procedures</h3>
        <p>The admin dashboard is the central hub for managing the application.</p>
        <ul className="list-disc pl-5 space-y-2">
            <li><strong>Users Tab:</strong> Search for users by name or email. Click on a user to view their detailed profile, transaction history, practice stats, and perform actions like changing their role or deleting them.</li>
            <li><strong>App Settings Tab:</strong> Modify global values for the token economy (e.g., change the signup bonus amount, adjust the cost of a feature). Changes here are live immediately.</li>
            <li><strong>Financial Tab:</strong> View a ledger of all real-money transactions (PayPal purchases and donations). This is for financial auditing. Manual revenue/expense entries can be made here.</li>
            <li><strong>Tokens Tab:</strong> View a system-wide ledger of all token transactions. This tab is for analyzing the token economy's health. You can also manually issue tokens to users from here for support or rewards.</li>
            <li><strong>Rooms Tab:</strong> View all Sync Online rooms. This allows an admin to manage rooms, for example by deleting rooms that are no longer needed or managing edit permissions for summaries.</li>
            <li><strong>Bulk Delete Tab:</strong> For permanently deleting multiple users at once. This is a destructive action and should be used with extreme caution.</li>
             <li><strong>Data Policy Tab:</strong> Provides a clear outline of the app's data handling procedures, differentiating between user-initiated deletion (anonymization) and admin-initiated deletion (hard delete).</li>
             <li><strong>Marketing Tab:</strong> Contains this SOP and marketing materials for reference.</li>
        </ul>
      </section>
    </div>
  );
}
