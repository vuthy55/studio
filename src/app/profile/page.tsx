
"use client";

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LoaderCircle, Save } from "lucide-react";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { countries } from 'countries-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateProfile as updateAuthProfile, updateEmail } from "firebase/auth";


export interface UserProfile {
  name: string;
  email: string;
  country?: string;
  mobile?: string;
  role?: 'admin' | 'user';
}

export default function ProfilePage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();
    const { toast } = useToast();
    
    const [profile, setProfile] = useState<Partial<UserProfile>>({ name: '', email: '', country: '', mobile: '', role: 'user' });
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);

    const fetchProfile = useCallback(async (uid: string) => {
        if (!user) return;
        setIsFetchingProfile(true);
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);

            const authEmail = user.email || '';
            
            if (userDocSnap.exists()) {
                const dbProfile = userDocSnap.data() as UserProfile;
                // Ensure email from auth is always the source of truth
                setProfile({ ...dbProfile, email: authEmail });
            } else {
                // If no profile exists, create a basic one to be saved.
                setProfile({
                    name: user.displayName || '',
                    email: authEmail,
                    country: '',
                    mobile: '',
                    role: 'user'
                });
            }
        } catch (fetchError) {
            console.error("Error fetching user profile:", fetchError);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch your profile." });
        } finally {
            setIsFetchingProfile(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.push('/login');
            return;
        }
        fetchProfile(user.uid);
    }, [user, loading, router, fetchProfile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setProfile(prev => ({ ...prev, [id]: value }));
    };

    const handleCountryChange = (value: string) => {
        setProfile(prev => ({ ...prev, country: value }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSaving(true);
        try {
            // Update Firebase Auth display name
            if (profile.name && profile.name !== user.displayName) {
                await updateAuthProfile(user, { displayName: profile.name });
            }
            
            // This logic is now disabled in the UI but kept here for reference.
            // If the email field were enabled, this is how it would work.
            if (profile.email && profile.email !== user.email) {
                 try {
                    await updateEmail(user, profile.email);
                } catch (error: any) {
                    if (error.code === 'auth/requires-recent-login') {
                        toast({ variant: 'destructive', title: 'Action Required', description: 'Changing your email requires you to log in again. Please log out and log back in to complete this change.', duration: 8000 });
                    } else {
                        throw error; // Rethrow other errors
                    }
                }
            }

            const userDocRef = doc(db, 'users', user.uid);
            const dataToSave = {
                name: profile.name || '',
                country: profile.country || '',
                mobile: profile.mobile || '',
                // Always save the email from auth as the source of truth
                email: user.email, 
                role: profile.role || 'user'
            };
            await setDoc(userDocRef, dataToSave, { merge: true });
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

    const countryOptions = Object.entries(countries).map(([code, country]) => ({
      value: code,
      label: country.name
    }));

    if (loading || isFetchingProfile) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (error) {
        return <p>Error: {error.message}</p>;
    }
    
    if (!user) {
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
                 <p className="ml-4">Redirecting...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex items-center gap-4">
                {isMobile && <SidebarTrigger />}
                <div>
                    <h1 className="text-3xl font-bold font-headline">Profile</h1>
                    <p className="text-muted-foreground">Manage your account settings and track your progress.</p>
                </div>
            </header>
            
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20 text-3xl">
                            <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{profile.name || 'Your Name'}</CardTitle>
                            <CardDescription>{profile.email}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveProfile} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={profile.name || ''} onChange={handleInputChange} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={profile.email || ''} onChange={handleInputChange} disabled />
                             <p className="text-xs text-muted-foreground">Your email address cannot be changed from this page.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="country">Country</Label>
                            <Select value={profile.country || ''} onValueChange={handleCountryChange}>
                                <SelectTrigger id="country">
                                    <SelectValue placeholder="Select your country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map(country => (
                                        <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number</Label>
                            <Input id="mobile" type="tel" value={profile.mobile || ''} onChange={handleInputChange} placeholder="e.g., +1 123 456 7890" />
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
