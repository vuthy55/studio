
"use client";

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { LoaderCircle, Save } from "lucide-react";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/user';
import { useToast } from '@/hooks/use-toast';
import { countries } from 'countries-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ProfilePage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { isMobile } = useSidebar();
    const { toast } = useToast();
    
    const [profile, setProfile] = useState<Partial<UserProfile>>({ name: '', email: '', country: '', mobile: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchProfile = async () => {
            if (user) {
                console.log('--- DEBUG: Fetching profile for user ID:', user.uid);
                const userProfile = await getUserProfile(user.uid);
                if (userProfile) {
                    setProfile(userProfile);
                } else {
                    console.log('--- DEBUG: No profile found in Firestore, pre-filling from auth data.');
                    // Pre-fill with auth data if no firestore doc exists
                    setProfile({
                        name: user.displayName || '',
                        email: user.email || '',
                    });
                }
            }
        };
        fetchProfile();
    }, [user]);

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
            await updateUserProfile({
                userId: user.uid,
                data: {
                    name: profile.name!,
                    email: profile.email!,
                    country: profile.country,
                    mobile: profile.mobile,
                }
            });
            toast({ title: 'Success', description: 'Profile updated successfully.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update profile.' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const getInitials = (name?: string) => {
        return name ? name.charAt(0).toUpperCase() : '?';
    };

    const countryOptions = Object.entries(countries).map(([code, country]) => ({
      value: code,
      label: country.name
    }));

    if (loading || !profile) {
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
                            <Input id="email" type="email" value={profile.email || ''} disabled />
                             <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
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
