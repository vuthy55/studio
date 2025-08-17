
"use client";

import React, { useState, useMemo } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useToast } from '@/hooks/use-toast';
import { doc, setDoc } from 'firebase/firestore';
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { anonymizeAndDeactivateUser } from '@/actions/user';
import { resetUserPracticeHistory } from '@/actions/admin';
import type { UserProfile as UserProfileType } from '@/lib/types';
import type { AzureLanguageCode } from '@/lib/azure-languages';
import { lightweightCountries } from '@/lib/location-data';
import { simpleLanguages } from '@/lib/simple-languages';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LoaderCircle, Save, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';


export default function ProfileSection() {
    const { user, userProfile, logout } = useUserData();
    const { toast } = useToast();

    const [edits, setEdits] = useState<Partial<UserProfileType>>({});
    const [isSaving, setIsSaving] = useState(false);
    const countryOptions = useMemo(() => lightweightCountries, []);
    
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isResettingStats, setIsResettingStats] = useState(false);
    
    const displayProfile = useMemo(() => ({
        ...userProfile,
        ...edits
    }), [userProfile, edits]);

    const handleInputChange = (field: keyof UserProfileType, value: any) => {
        setEdits(prev => ({ ...prev, [field]: value }));
    };
    
    const handleLanguageChange = (value: string) => {
        handleInputChange('defaultLanguage', value);
    }
    
    const handleCountryChange = (value: string) => {
        handleInputChange('country', value);
    }

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || Object.keys(edits).length === 0) return;
        setIsSaving(true);
        try {
            const dataToSave: Partial<UserProfileType> = {
                ...edits,
                searchableName: (displayProfile.name || '').toLowerCase(),
            };
            
            if (edits.name && edits.name !== user.displayName) {
                await updateAuthProfile(user, { displayName: edits.name });
            }
            
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, dataToSave, { merge: true });
            
            setEdits({});
            toast({ title: 'Success', description: 'Profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update profile. ' + error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const getInitials = (name?: string) => {
        return name ? name.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || '?');
    };

    const handleDeleteAccount = async () => {
        if (!user || !user.email || deleteConfirmation !== 'delete my account') {
            toast({ variant: 'destructive', title: 'Confirmation failed', description: 'The confirmation phrase does not match.'});
            return;
        }

        setIsDeleting(true);
        const result = await anonymizeAndDeactivateUser({ userId: user.uid });
        if (result.success) {
            await logout();
            toast({ title: "Your VibeSync Journey Is Paused", description: "Your account has been deleted, but we'll be here to welcome you back whenever you're ready to sync with the local vibe again." });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete your account.' });
            setIsDeleting(false);
        }
    };

    const handleImmediateAlertChange = async (checked: boolean) => {
        if (!user) return;
        
        handleInputChange('immediateBuddyAlert', checked);

        try {
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, { immediateBuddyAlert: checked }, { merge: true });
        } catch (error: any) {
            console.error("Error updating immediate alert setting:", error);
            handleInputChange('immediateBuddyAlert', !checked);
            toast({ variant: "destructive", title: "Error", description: "Could not save setting." });
        }
    };

    const handleResetStats = async () => {
        if (!user) return;
        setIsResettingStats(true);
        const result = await resetUserPracticeHistory(user.uid);
        if (result.success) {
            toast({ title: 'Stats Reset', description: 'Your practice history has been successfully cleared.'});
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not reset your stats.'});
        }
        setIsResettingStats(false);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20 text-3xl">
                             <AvatarImage src={user?.photoURL || undefined} alt={displayProfile.name || 'User Avatar'} />
                            <AvatarFallback>{getInitials(displayProfile.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{displayProfile.name || 'Your Name'}</CardTitle>
                            <CardDescription>{displayProfile.email}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveProfile} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input id="name" value={displayProfile.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={displayProfile.email || ''} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="defaultLanguage">Default Spoken Language</Label>
                                <Select value={displayProfile.defaultLanguage || ''} onValueChange={handleLanguageChange}>
                                    <SelectTrigger id="defaultLanguage">
                                        <SelectValue placeholder="Select your preferred language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <ScrollArea className="h-72">
                                        {simpleLanguages.map((lang: any) => (
                                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                        ))}
                                        </ScrollArea>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="country">Country</Label>
                                <Select value={displayProfile.country || ''} onValueChange={handleCountryChange}>
                                    <SelectTrigger id="country">
                                        <SelectValue placeholder="Select your country" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {countryOptions.map((country: any) => (
                                            <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="mobile">Mobile Number</Label>
                                <Input id="mobile" type="tel" value={displayProfile.mobile || ''} onChange={(e) => handleInputChange('mobile', e.target.value)} placeholder="e.g., +1 123 456 7890" />
                            </div>
                        </div>
                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isSaving || Object.keys(edits).length === 0}>
                                {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle/> Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2 p-4 border rounded-lg">
                        <h4 className="font-semibold">Immediate Buddy Alert</h4>
                        <p className="text-xs text-muted-foreground">Enable this to send a Buddy Alert immediately upon clicking the button in the sidebar, skipping the confirmation dialog.</p>
                        <div className="flex items-center space-x-2 pt-2">
                            <Switch
                                id="immediateBuddyAlert"
                                checked={!!displayProfile.immediateBuddyAlert}
                                onCheckedChange={handleImmediateAlertChange}
                            />
                            <Label htmlFor="immediateBuddyAlert">Enable Immediate Alert</Label>
                        </div>
                    </div>

                    <div className="space-y-2 p-4 border rounded-lg">
                        <h4 className="font-semibold">Reset Practice Stats</h4>
                        <p className="text-xs text-muted-foreground">This will permanently delete all your practice history. This action cannot be undone.</p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" disabled={isResettingStats}>
                                    <RefreshCw className="mr-2"/> 
                                    {isResettingStats ? 'Resetting...' : 'Reset All Practice Stats'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action will permanently delete all of your practice history. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetStats} disabled={isResettingStats}>
                                        {isResettingStats ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                        Confirm & Reset Stats
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    <div className="space-y-2 p-4 border rounded-lg sm:col-span-2">
                        <h4 className="font-semibold">Delete Account</h4>
                         <p className="text-xs text-muted-foreground">Permanently deactivate and anonymize your account.</p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Trash2 className="mr-2"/> Delete My Account
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action is irreversible. To confirm, please type <strong className="text-destructive">delete my account</strong> below.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <Input 
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                                    placeholder="delete my account"
                                />
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleting || deleteConfirmation !== 'delete my account'}>
                                        {isDeleting ? <LoaderCircle className="animate-spin mr-2"/> : null}
                                        Confirm Deletion
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
