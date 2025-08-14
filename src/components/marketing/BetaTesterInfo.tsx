
"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
        <p>Please spend time exploring the following core features:</p>
        <ul>
          <li>
            <strong>Learn:</strong> The main language learning module.
            <ul>
              <li>Does practicing phrases feel intuitive?</li>
              <li>Is the pronunciation feedback helpful?</li>
              <li>Do you feel you are learning effectively?</li>
            </ul>
          </li>
          <li>
            <strong>Converse:</strong> Our 1-on-1 live translation tool.
            <ul>
              <li>Test both voice and text input. Are the translations accurate?</li>
              <li>Is the audio playback clear?</li>
            </ul>
          </li>
           <li>
            <strong>Connect:</strong> The community hub for Vibes, Meetups, and Voice Rooms.
            <ul>
                <li>Join or create a Vibe (a chat room).</li>
                <li>Schedule a Voice Room and invite a friend to test real-time voice translation.</li>
            </ul>
          </li>
           <li>
            <strong>Buddy Alert System:</strong> A community safety feature.
            <ul>
                <li>Add another tester as a buddy.</li>
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
            <li><strong>Spending Tokens:</strong> Use tokens for translations, Voice Room usage, and downloading language packs.</li>
            <li><strong>Buying Tokens:</strong> Test the "Buy Tokens" functionality. You can use a test PayPal account to simulate a purchase.</li>
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
