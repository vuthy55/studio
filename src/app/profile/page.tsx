
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from '@/lib/firebase';
import { useUser } from '@/hooks/use-user';
import { LoaderCircle, User as UserIcon, Upload, Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { CountrySelect } from '@/components/ui/country-select';


export default function ProfilePage() {
    const [user, authLoading, authError] = useAuthState(auth);
    const { profile, loading: profileLoading } = useUser(user?.uid);
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [country, setCountry] = useState('');
    const [mobile, setMobile] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (profile) {
            setName(profile.name || '');
            setCountry(profile.country || '');
            setMobile(profile.mobile || '');
        }
    }, [profile]);
    
    const handleSaveChanges = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSaving(true);
        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                name,
                country,
                mobile,
            });
            toast({ title: 'Success', description: 'Profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = () => {
        auth.signOut();
        router.push('/login');
    };

    const avatarFallback = useMemo(() => {
        return name ? name.charAt(0).toUpperCase() : <UserIcon />;
    }, [name]);
    
    const loading = authLoading || profileLoading;

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || !profile) {
        return (
             <div className="flex flex-col justify-center items-center h-[calc(100vh-8rem)] gap-4">
                <p>Could not load user profile. Please try logging out and back in.</p>
                <Button onClick={handleLogout}><LogOut /> Logout</Button>
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <header className="flex items-start gap-6">
                <Avatar className="w-24 h-24 border-4 border-primary/50 text-4xl">
                    <AvatarImage src={profile.avatarUrl} alt={name} />
                    <AvatarFallback className="bg-muted">{avatarFallback}</AvatarFallback>
                </Avatar>
                 <div>
                    <h1 className="text-3xl font-bold font-headline">{name}</h1>
                    <p className="text-muted-foreground">{profile.email}</p>
                    <div className="flex gap-2 mt-4">
                        <Button size="sm" variant="outline" disabled>
                            <Upload className="mr-2 h-4 w-4" /> Upload Photo
                        </Button>
                        <Button size="sm" variant="outline" disabled>
                             <Sparkles className="mr-2 h-4 w-4" /> Generate AI Avatar
                        </Button>
                    </div>
                </div>
            </header>
            
            <Tabs defaultValue="profile" className="w-full">
                <TabsList>
                    <TabsTrigger value="profile">My Profile</TabsTrigger>
                    <TabsTrigger value="stats" disabled>My Stats</TabsTrigger>
                    {profile.isAdmin && <TabsTrigger value="admin" disabled>Admin</TabsTrigger>}
                </TabsList>
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Details</CardTitle>
                            <CardDescription>Update your personal information here.</CardDescription>
                        </CardHeader>
                        <form onSubmit={handleSaveChanges}>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" value={profile.email || ''} disabled />
                                    </div>
                                     <div className="space-y-2">
                                        <Label htmlFor="mobile">Mobile Number</Label>
                                        <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Your mobile number" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="country">Country</Label>
                                        <CountrySelect value={country} onChange={(e) => setCountry(e.target.value)} />
                                    </div>
                                </div>
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? <LoaderCircle className="animate-spin" /> : 'Save Changes'}
                                </Button>
                            </CardContent>
                        </form>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

