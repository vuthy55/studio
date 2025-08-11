
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import AdminSOP from '@/components/marketing/AdminSOP';
import BackpackerMarketing from '@/components/marketing/BackpackerMarketing';
import MarketingRelease from '@/components/marketing/MarketingRelease';
import MarketingRelease2 from '@/components/marketing/MarketingRelease2';
import MarketingRelease3 from '@/components/marketing/MarketingRelease3';
import BetaTesterInfo from '@/components/marketing/BetaTesterInfo';
import BetaTesterInfoKhmer from '@/components/marketing/BetaTesterInfoKhmer';
import { MessageSquareQuote } from 'lucide-react';

export default function MessagingTab() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquareQuote /> App Messaging &amp; Policy</CardTitle>
                <CardDescription>
                    Standardized documentation for administrative procedures, external marketing, and data policies.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <Accordion type="single" collapsible className="w-full">
                     <AccordionItem value="item-beta">
                        <AccordionTrigger>Beta Tester Information (English)</AccordionTrigger>
                        <AccordionContent>
                           <BetaTesterInfo />
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="item-beta-khmer">
                        <AccordionTrigger>Beta Tester Information (Khmer)</AccordionTrigger>
                        <AccordionContent>
                           <BetaTesterInfoKhmer />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>Admin Standard Operating Procedures (SOP)</AccordionTrigger>
                        <AccordionContent>
                           <AdminSOP />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                        <AccordionTrigger>Marketing Copy for Backpackers</AccordionTrigger>
                        <AccordionContent>
                           <BackpackerMarketing />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                        <AccordionTrigger>Release 0.1 Marketing Page</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease />
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="item-5">
                        <AccordionTrigger>Release 0.1 Marketing Page 2</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease2 />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-6">
                        <AccordionTrigger>Release 0.1 Marketing Page 3</AccordionTrigger>
                        <AccordionContent>
                           <MarketingRelease3 />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}
