
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from '@/lib/firebase';
import { updateProfile } from "firebase/auth";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, BarChart, Settings, Shield, LoaderCircle, Camera, Sparkles } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

type UserProfile = {
    uid: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    realPhotoUrl?: string;
    isAdmin?: boolean;
    isBlocked?: boolean;
    tokens?: number;
    createdAt?: Date;
    mobile?: string;
    country?: string;
};

export default function ProfilePage() {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Editable fields
    const [name, setName] = useState('');

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (user) {
            const unsub = onSnapshot(doc(db, "users", user.uid), (doc) => {
                if (doc.exists()) {
                    const data = doc.data() as UserProfile;
                    setProfile(data);
                    setName(data.name || '');
                } else {
                    console.log("User profile not found, might be creating...");
                }
            });
            return () => unsub();
        }
    }, [user]);

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !profile) return;

        setIsSaving(true);
        try {
            const userRef = doc(db, "users", user.uid);
            
            // Prepare the data to be updated
            const updatedData: Partial<UserProfile> = {
                name: name,
            };

            await setDoc(userRef, updatedData, { merge: true });

            // Also update the auth profile if the name has changed
            if (user.displayName !== name) {
                 await updateProfile(user, { displayName: name });
            }

            toast({
                title: "Success",
                description: "Your profile has been updated.",
            });

        } catch (error: any) {
            console.error("Profile update error", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not update your profile. " + error.message,
            });
        } finally {
            setIsSaving(false);
        }
    };


    if (loading || !profile || !user) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (error) {
        return <p>Error: {error.message}</p>;
    }

    const getInitials = (name?: string) => {
        if (name) {
            return name.charAt(0).toUpperCase();
        }
        if (user?.email) {
            return user.email.charAt(0).toUpperCase();
        }
        return <User />;
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Profile</h1>
                        <p className="text-muted-foreground">Manage your account settings and track your progress.</p>
                    </div>
                </div>
            </header>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-4">
                    <TabsTrigger value="profile"><User className="mr-2" />My Profile</TabsTrigger>
                    <TabsTrigger value="stats"><BarChart className="mr-2" />My Stats</TabsTrigger>
                    <TabsTrigger value="settings"><Settings className="mr-2" />Settings</TabsTrigger>
                    {profile.isAdmin && <TabsTrigger value="admin"><Shield className="mr-2" />Admin</TabsTrigger>}
                </TabsList>
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Profile</CardTitle>
                            <CardDescription>
                               This is your personal information. Click save when you're done.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleProfileUpdate} className="space-y-8">
                                <div className="flex flex-col md:flex-row items-start gap-8">
                                    <div className="flex flex-col items-center gap-4">
                                        <Avatar className="w-32 h-32 text-4xl">
                                            <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                                            <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="grid grid-cols-2 gap-2 w-full">
                                            <Button type="button" variant="outline"><Camera />Upload</Button>
                                            <Button type="button" variant="outline"><Sparkles />AI Avatar</Button>
                                        </div>
                                    </div>

                                    <div className="space-y-4 flex-1 w-full">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Name</Label>
                                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <Input id="email" type="email" value={profile.email || ''} disabled />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="mobile">Mobile</Label>
                                            <Input id="mobile" placeholder="Your mobile number (optional)" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="country">Country</Label>
                                            <Input id="country" placeholder="Your country (optional)" />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-end">
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving && <LoaderCircle className="animate-spin" />}
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="stats">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Stats</CardTitle>
                            <CardDescription>
                                Track your learning progress.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-center h-48">
                                <p className="text-muted-foreground">Statistics coming soon!</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Settings</CardTitle>
                            <CardDescription>
                                Manage your application settings.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center justify-center h-48">
                                <p className="text-muted-foreground">Settings options coming soon!</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {profile.isAdmin && (
                    <TabsContent value="admin">
                        <Card>
                            <CardHeader>
                                <CardTitle>Admin Panel</CardTitle>
                                <CardDescription>
                                    Manage application-wide settings.
                                </Description>
                            </Header>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-center h-48">
                                    <p className="text-muted-foreground">Admin panel coming soon!</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
