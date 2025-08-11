
"use client";

import React from 'react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

export default function BetaTesterInfo() {
  return (
    <div className="space-y-6 text-sm p-2 prose prose-sm prose-headings:font-bold prose-headings:text-primary prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground">
      
      <section>
        <h3>Welcome, VibeSync Beta Tester!</h3>
        <p>
          Thank you for helping us test and refine VibeSync. Your feedback is crucial for making this the best possible tool for travelers. This guide will walk you through the key areas to focus on during your testing.
        </p>
      </section>

      <section>
        <h3>What is VibeSync?</h3>
        <p>
          VibeSync is an all-in-one app designed to help backpackers in Southeast Asia overcome language barriers. It combines language learning, live translation, and group communication tools to foster genuine connections.
        </p>
      </section>

      <section>
        <h3>Key Features to Test</h3>
        <p>Please spend time exploring the following core features, which can be found in the main sidebar navigation:</p>
        <ul>
          <li>
            <strong>Learn Tab:</strong> This is the home for language learning.
            <ul>
              <li><strong>Phrasebook:</strong> Does practicing phrases feel intuitive? Is the pronunciation feedback helpful?</li>
              <li><strong>Translator:</strong> Test the live text translation. Can you easily save new phrases to your personal practice list?</li>
            </ul>
          </li>
          <li>
            <strong>Converse Tab:</strong> This is the 1-on-1 live conversation tool.
            <ul>
              <li>Test speaking into the app with another person. Are the voice translations accurate and timely?</li>
            </ul>
          </li>
           <li>
            <strong>Connect Tab:</strong> This is the central hub for community interaction.
            <ul>
                <li><strong>Vibes:</strong> Join or create public/private chat rooms. Is the experience smooth?</li>
                <li><strong>Meetups:</strong> Find or create real-world events from within a Vibe.</li>
                <li><strong>Voice Rooms:</strong> Schedule and join multi-language group voice calls.</li>
            </ul>
          </li>
           <li>
            <strong>Buddy Alert System:</strong> A community safety feature.
            <ul>
                <li>Add another tester as a buddy from their profile.</li>
                <li>Try sending a Buddy Alert from the button in the sidebar. Did your buddy receive the notification?</li>
            </ul>
          </li>
        </ul>
      </section>

      <section>
        <h3>The Token Economy</h3>
        <p>
          The app uses a token system. For the beta, all token purchases are using a <strong>test environment</strong> (PayPal Sandbox). No real money will be charged.
        </p>
         <ul>
            <li><strong>Earning Tokens:</strong> You get a signup bonus and can earn more by mastering phrases in the "Learn" tab or by referring friends. Please test the referral system!</li>
            <li><strong>Spending Tokens:</strong> Use tokens for live translations, Converse/Voice Room usage, and downloading language packs.</li>
            <li><strong>Buying Tokens:</strong> Test the "Buy Tokens" functionality from your profile. You can use a test PayPal account to simulate a purchase.</li>
        </ul>
      </section>

      <section>
        <h3>How to Give Feedback</h3>
        <p>
            Your feedback is the most valuable part of this beta test. Please use the <strong>"Give Feedback"</strong> link in the sidebar to submit your thoughts.
        </p>
        <p>What to report:</p>
        <ul>
            <li><strong>Bugs:</strong> Anything that seems broken or causes an error. Please describe the steps you took to make it happen. A screenshot is extremely helpful!</li>
            <li><strong>Translation Errors:</strong> If a translation seems wrong or unnatural, let us know.</li>
            <li><strong>Usability Issues:</strong> Is anything confusing or hard to use? Did you get stuck anywhere?</li>
            <li><strong>Feature Ideas:</strong> Is there anything you wish the app could do?</li>
        </ul>
      </section>

       <section>
        <h3>Thank You!</h3>
        <p>
            We're a small team passionate about travel and connection. Your contribution will directly shape the future of VibeSync. Happy testing!
        </p>
      </section>

    </div>
  );
}
