
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle, Save, Award, DollarSign, Timer, MessageSquareHeart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAppSettingsAction, updateAppSettingsAction, type AppSettings } from '@/actions/settings';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

export default function SettingsTab() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<Partial<AppSettings>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getAppSettingsAction().then(data => {
            setSettings(data);
            setIsLoading(false);
        });
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        // This save action should submit all settings managed by this tab.
        // It correctly passes the entire 'settings' object.
        try {
            const result = await updateAppSettingsAction(settings);
            if (result.success) {
                toast({ title: "Success", description: "Application settings have been updated." });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error || "Could not save settings." });
            }
        } catch (error: any) {
            
            toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        const isNumeric = type === 'number';
        setSettings(prev => ({...prev, [id]: isNumeric ? Number(value) : value }));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    const renderNumberInput = (key: string, label: string, description: string) => (
        <div className="space-y-2" key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input id={key as keyof AppSettings} type="number" value={(settings as any)[key] ?? ''} onChange={handleInputChange} />
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>App Settings</CardTitle>
                <CardDescription>Manage the token economy and other application-wide settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                    {/* Column 1: Rewards & Costs */}
                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><Award className="text-primary"/> Rewards & Costs</h3>
                         <Separator />
                        {renderNumberInput('signupBonus', 'Signup Bonus', 'Tokens a new user gets on signup.')}
                        {renderNumberInput('referralBonus', 'Referral Bonus', 'Tokens a user gets for a successful referral.')}
                        {renderNumberInput('practiceReward', 'Practice Reward', 'Tokens earned for mastering a phrase.')}
                        {renderNumberInput('practiceThreshold', 'Practice Threshold', 'Successful practices to earn reward.')}
                        {renderNumberInput('infohubAiCost', 'InfoHub AI Cost', 'Tokens to get latest AI travel intel for one country.')}
                        {renderNumberInput('freeSavedPhrasesLimit', 'Free Saved Phrases Limit', 'Number of phrases a user can save for offline practice for free.')}
                    </div>

                    {/* Column 2: Limits & Timers */}
                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="text-primary"/> Feature Costs</h3>
                         <Separator />
                        {renderNumberInput('costPerSyncLiveMinute', 'Sync Live Cost (per minute)', 'Tokens per minute for the 1-on-1 Sync Live feature.')}
                        {renderNumberInput('costPerSyncOnlineMinute', 'Sync Online Cost (per person/min)', 'Token cost for each person in a room for each minute of usage.')}
                        {renderNumberInput('translationCost', 'Live Translation Cost', 'Token cost for a single translation in the Live Translation tool.')}
                        {renderNumberInput('liveTranslationSavePhraseCost', 'Save Phrase Cost', 'Tokens to save a phrase for offline practice (after free limit).')}
                        {renderNumberInput('languageUnlockCost', 'Language Pack Unlock Cost', 'One-time token cost for a user to unlock a non-free language pack.')}
                        {renderNumberInput('summaryTranslationCost', 'Summary Translation Cost', 'Token cost per language to translate a meeting summary.')}
                        {renderNumberInput('transcriptCost', 'Transcript Generation Cost', 'Token cost to generate and download a meeting transcript.')}
                    </div>

                    <div className="space-y-6">
                         <h3 className="text-lg font-semibold flex items-center gap-2"><Timer className="text-primary"/> Time & Inactivity</h3>
                         <Separator />
                        {renderNumberInput('freeSyncLiveMinutes', 'Free Sync Live Minutes', 'Free monthly minutes for Sync Live.')}
                        {renderNumberInput('freeSyncOnlineMinutes', 'Free Sync Online Minutes', 'Free monthly minutes for Sync Online.')}
                        {renderNumberInput('maxUsersPerRoom', 'Max Users per Sync Room', 'Max users in a Sync Online room.')}
                        {renderNumberInput('roomReminderMinutes', 'Room Reminder (minutes)', 'Remind users N minutes before a room\'s booked time ends.')}
                        {renderNumberInput('vibeInactivityDays', 'Vibe Inactivity Days', 'Days a Vibe can be inactive before being moved to the bottom of the list.')}
                    </div>
                 </div>
                 
                 <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2 mt-8 mb-4"><MessageSquareHeart className="text-primary"/> Community</h3>
                    <Separator />
                     <div className="space-y-2 mt-6">
                        <Label htmlFor="vibeCommunityRules">Vibe Community Rules</Label>
                        <Textarea 
                            id="vibeCommunityRules"
                            value={settings.vibeCommunityRules || ''}
                            onChange={handleInputChange}
                            rows={6}
                        />
                        <p className="text-sm text-muted-foreground">These rules are shown to users before they report a Vibe. Use line breaks for separate rules.</p>
                    </div>
                 </div>

                 <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Settings
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
