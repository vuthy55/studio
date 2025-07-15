
"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from '@/lib/firebase';
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
import { generateAvatar } from '@/ai/flows/generate-avatar-flow';


export default function ProfilePage() {
    const [user, authLoading, authError] = useAuthState(auth);
    const { profile, loading: profileLoading } = useUser(user?.uid);
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [country, setCountry] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (profile) {
            setName(profile.name || '');
            setCountry(profile.country || '');
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
            });
            toast({ title: 'Success', description: 'Profile updated successfully.' });
        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleAvatarUpdate = async (newAvatarUrl: string) => {
        if (!user) return;
        try {
            console.log(`[DEBUG ${new Date().toISOString()}] Starting Firestore avatar URL update...`);
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { avatarUrl: newAvatarUrl });
            console.log(`[DEBUG ${new Date().toISOString()}] Firestore avatar URL update successful.`);
            toast({ title: 'Success', description: 'Avatar updated successfully.' });
        } catch (error) {
            console.error("Error updating avatar:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update avatar.' });
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        console.log(`[DEBUG ${new Date().toISOString()}] --- Starting Photo Upload ---`);
        setIsUploading(true);
        try {
            console.log(`[DEBUG ${new Date().toISOString()}] Starting image resize...`);
            const resizedBlob = await new Promise<Blob>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 512;
                        const MAX_HEIGHT = 512;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            return reject(new Error('Could not get canvas context'));
                        }
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob(
                            (blob) => {
                                if (blob) {
                                    console.log(`[DEBUG ${new Date().toISOString()}] Image resize complete. Blob size: ${blob.size} bytes`);
                                    resolve(blob);
                                } else {
                                    reject(new Error('Canvas to Blob conversion failed'));
                                }
                            },
                            'image/jpeg',
                            0.9
                        );
                    };
                    img.onerror = reject;
                    img.src = e.target?.result as string;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const storageRef = ref(storage, `avatars/${user.uid}/profile.jpg`);
            console.log(`[DEBUG ${new Date().toISOString()}] Starting upload to Firebase Storage...`);
            const snapshot = await uploadBytes(storageRef, resizedBlob);
            console.log(`[DEBUG ${new Date().toISOString()}] Upload complete. Getting download URL...`);
            const downloadURL = await getDownloadURL(snapshot.ref);
            console.log(`[DEBUG ${new Date().toISOString()}] Got download URL. Starting avatar update function...`);

            await handleAvatarUpdate(downloadURL);
            console.log(`[DEBUG ${new Date().toISOString()}] --- Photo Upload Finished ---`);


        } catch (error) {
            console.error("Error uploading file:", error);
            toast({ variant: 'destructive', title: 'Upload Error', description: 'Failed to upload new photo.' });
        } finally {
            setIsUploading(false);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    
    const handleGenerateAvatar = async () => {
        if (!user) return;
        setIsGenerating(true);
        try {
            const result = await generateAvatar({
                userId: user.uid,
                userName: name,
                baseImageUrl: profile?.avatarUrl // Pass current avatar URL if it exists
            });

            if (result.avatarUrl) {
                await handleAvatarUpdate(result.avatarUrl);
            } else {
                 throw new Error("AI did not return a valid image URL.");
            }
        } catch (error) {
            console.error("Error generating AI avatar:", error);
            toast({ variant: 'destructive', title: 'AI Avatar Error', description: 'Could not generate AI avatar.' });
        } finally {
            setIsGenerating(false);
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
                    <p className="text-muted-foreground">{user.email}</p>
                    <div className="flex gap-2 mt-4">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            className="hidden"
                        />
                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isGenerating}>
                            {isUploading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                             {isUploading ? 'Uploading...' : 'Upload Photo'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleGenerateAvatar} disabled={isUploading || isGenerating}>
                             {isGenerating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                             {isGenerating ? 'Generating...' : 'Generate AI Avatar'}
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
                                        <Input id="email" value={user.email || ''} disabled />
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
