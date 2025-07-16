
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { LoaderCircle, Save } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";


const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50),
  email: z.string().email(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // Get a reference to the user's document in Firestore
    const userDocRef = user ? doc(db, 'users', user.uid) : null;
    
    // Use the hook to get document data
    const [profileData, profileLoading, profileError] = useDocumentData(userDocRef);

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { name: '', email: '' },
    });

    useEffect(() => {
        // If auth is done loading and there's no user, redirect to login
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        // When profile data is loaded from Firestore, update the form
        if (profileData) {
            form.reset({
                name: profileData.name || '',
                email: profileData.email || '',
            });
        }
    }, [profileData, form]);

    const onSubmit = async (data: ProfileFormValues) => {
        if (!user) {
            toast({ variant: "destructive", title: "Error", description: "You are not logged in." });
            return;
        }

        setIsSaving(true);
        try {
            // Update Firestore document
            if (userDocRef) {
                await updateDoc(userDocRef, { name: data.name });
            }
            
            // Update Firebase Auth profile
            await updateProfile(user, { displayName: data.name });

            toast({ title: "Success", description: "Your profile has been updated." });

        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update profile." });
        } finally {
            setIsSaving(false);
        }
    };
    
    // Show a loading spinner while auth or profile data is loading
    if (authLoading || profileLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <p className="ml-4">Redirecting to login...</p>
            </div>
        );
    }

     if (profileError) {
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <p className="ml-4 text-destructive">Error loading profile: {profileError.message}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold font-headline">Profile</h1>
                <p className="text-muted-foreground">Manage your account settings.</p>
            </header>
            
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                    <CardDescription>Update your name and view your account email.</CardDescription>
                </CardHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardContent className="space-y-4">
                           <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Your name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Your email" {...field} readOnly disabled />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? (
                                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Changes
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
