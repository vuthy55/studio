
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { updateProfile } from "firebase/auth";
import { auth } from '@/lib/firebase';
import { LoaderCircle, Save, Languages } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";

const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50),
  email: z.string().email(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
    const [user, authLoading, authError] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const { isMobile } = useSidebar();

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { name: '', email: '' },
    });

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            form.reset({
                name: user.displayName || '',
                email: user.email || '',
            });
        }
    }, [user, form]);

    const onSubmit = async (data: ProfileFormValues) => {
        if (!auth.currentUser) {
            toast({ variant: "destructive", title: "Error", description: "You are not logged in." });
            return;
        }

        setIsSaving(true);
        try {
            if (auth.currentUser.displayName !== data.name) {
                await updateProfile(auth.currentUser, { displayName: data.name });
            }
            toast({ title: "Success", description: "Your profile has been updated." });
        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update profile." });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (authLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
                <p className="ml-4">Loading profile...</p>
            </div>
        );
    }
    
    if (!user) {
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
                <p className="ml-4">Redirecting to login...</p>
            </div>
        );
    }

    if (authError) {
        return (
             <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <p className="ml-4 text-destructive">Error loading authentication: {authError.message}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex items-center gap-4">
                {isMobile && <SidebarTrigger />}
                <div>
                  <h1 className="text-3xl font-bold font-headline">Profile</h1>
                  <p className="text-muted-foreground">Manage your account and track your progress.</p>
                </div>
            </header>
            
            <Card>
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
                            <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
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
