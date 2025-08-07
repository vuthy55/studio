
"use client";

import React from 'react';
import AudioPackGenerator from '../AudioPackGenerator';
import FreeLanguagePacksManager from '../FreeLanguagePacksManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export default function LanguagePacksTab() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Language Packs</CardTitle>
                <CardDescription>
                    Manage offline language packs. Generate new packs and set which ones are free for users to download.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="generate">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="generate">Generate</TabsTrigger>
                        <TabsTrigger value="free-packs">Free Language Packs</TabsTrigger>
                    </TabsList>
                    <TabsContent value="generate" className="mt-4">
                        <AudioPackGenerator />
                    </TabsContent>
                    <TabsContent value="free-packs" className="mt-4">
                        <FreeLanguagePacksManager />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
