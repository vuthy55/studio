
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LoaderCircle, Save, Shield, User as UserIcon, ArrowLeft } from "lucide-react";
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { countries } from 'countries-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UserProfile } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';

export default function UserDetailPage() {
    const params = useParams();
    const userId = params.userId as string;
    const [adminUser, adminLoading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();

    const [profile, setProfile] = useState<Partial<UserProfile>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);

    const countryOptions = Object.entries(countries).map(([code, country]) => ({
      value: code,
      label: country.name
    }));

    const fetchProfile = useCallback(async (uid: string) => {
        setIsFetchingProfile(true);
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as UserProfile & { id: string });
            } else {
                toast({ variant: "destructive", title: "Not Found", description: "This user does not exist." });
                router.push('/admin');
            }
        } catch (fetchError) {
            console.error("Error fetching user profile:", fetchError);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch user profile." });
        } finally {
            setIsFetchingProfile(false);
        }
    }, [router, toast]);

    useEffect(() => {
        if (adminLoading) return;
        if (!adminUser) {
            router.push('/login');
            return;
        }
        if (userId) {
            fetchProfile(userId);
        }
    }, [adminUser, adminLoading, router, userId, fetchProfile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setProfile(prev => ({ ...prev, [id]: value }));
    };

    const handleCountryChange = (value: string) => {
        setProfile(prev => ({ ...prev, country: value }));
    };
    
    const handleRoleChange = (isNowAdmin: boolean) => {
        if (adminUser?.uid === userId) {
            toast({ variant: "destructive", title: "Action not allowed", description: "You cannot change your own role."});
            return;
        }
        setProfile(prev => ({ ...prev, role: isNowAdmin ? 'admin' : 'user' }));
    }

    const handleSaveChanges = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adminUser) return;
        setIsSaving(true);
        try {
            const userDocRef = doc(db, 'users', userId);
            const { name, email, country, mobile, role } = profile;
            
            await setDoc(userDocRef, { name, email, country, mobile, role }, { merge: true });
            
            toast({ title: 'Success', description: 'User profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update profile. ' + error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const getInitials = (name?: string) => {
        return name ? name.charAt(0).toUpperCase() : (profile.email?.charAt(0).toUpperCase() || '?');
    };

    if (adminLoading || isFetchingProfile) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <header>
                <Button variant="ghost" asChild>
                    <Link href="/admin">
                        <ArrowLeft className="mr-2 h-4 w-4"/>
                        Back to All Users
                    </Link>
                </Button>
            </header>
            
             <form onSubmit={handleSaveChanges}>
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-1">
                        <Card>
                            <CardHeader className="items-center text-center">
                                <Avatar className="h-24 w-24 text-4xl">
                                    <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                                </Avatar>
                                <CardTitle className="text-2xl">{profile.name || 'User Name'}</CardTitle>
                                <CardDescription>{profile.email}</CardDescription>
                            </CardHeader>
                            <CardContent className="text-center">
                                 {profile.role === 'admin' ? 
                                    <Badge><Shield className="mr-1 h-3 w-3" /> Admin</Badge> : 
                                    <Badge variant="secondary"><UserIcon className="mr-1 h-3 w-3" /> User</Badge>
                                }
                            </CardContent>
                        </Card>
                    </div>

                    <div className="md:col-span-2">
                        <Card>
                             <CardHeader>
                                <CardTitle>Edit Profile</CardTitle>
                                <CardDescription>Modify the user's details below.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input id="name" value={profile.name || ''} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" value={profile.email || ''} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="country">Country</Label>
                                    <Select value={profile.country || ''} onValueChange={handleCountryChange}>
                                        <SelectTrigger id="country">
                                            <SelectValue placeholder="Select user's country" />
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
                                    <Input id="mobile" type="tel" value={profile.mobile || ''} onChange={handleInputChange} />
                                </div>
                                <div className="flex items-center space-x-2 rounded-md border p-4">
                                    <div className="flex-1 space-y-1">
                                      <p className="text-sm font-medium leading-none">Administrator Role</p>
                                      <p className="text-sm text-muted-foreground">
                                        Admins can manage users and other app settings.
                                      </p>
                                    </div>
                                    <Switch
                                        checked={profile.role === 'admin'}
                                        onCheckedChange={handleRoleChange}
                                        disabled={adminUser?.uid === userId}
                                        aria-label="Toggle admin role"
                                    />
                                </div>
                                 <div className="flex justify-end">
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </div>
    );
}