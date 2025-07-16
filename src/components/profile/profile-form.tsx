
"use client";

import { useEffect, useState, useRef } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/lib/types';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoaderCircle, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50, { message: "Name must not be longer than 50 characters." }),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileFormProps {
  user: User;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: "" },
    mode: "onChange",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      const userRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        form.reset({ name: data.name });
        setAvatarPreview(data.avatarUrl);
      } else {
        console.error("No such user document!");
        toast({ variant: "destructive", title: "Error", description: "Could not find user profile." });
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [user, form, toast]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const storageRef = ref(storage, `avatars/${user.uid}/${file.name}`);

    try {
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setAvatarPreview(downloadURL); // Update preview immediately

      // Update Firestore
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { avatarUrl: downloadURL });
      
      // Update Auth profile
      await updateProfile(user, { photoURL: downloadURL });
      
      setProfile(prev => prev ? { ...prev, avatarUrl: downloadURL } : null);
      toast({ title: "Success", description: "Avatar updated successfully." });

    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({ variant: "destructive", title: "Upload Error", description: "Failed to upload new avatar." });
    } finally {
      setIsUploading(false);
    }
  };


  const onSubmit = async (data: ProfileFormValues) => {
    setIsLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { name: data.name });
      
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: data.name });
      }
      
      setProfile(prev => prev ? { ...prev, name: data.name } : null);
      toast({ title: "Success", description: "Your profile has been updated." });

    } catch (error) {
      console.error("Error updating profile:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to update profile." });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="flex justify-center items-center p-8">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
        <CardDescription>Update your name and profile picture.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
             <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <Avatar className="h-32 w-32 cursor-pointer" onClick={handleAvatarClick}>
                    <AvatarImage src={avatarPreview || undefined} alt={profile?.name} />
                    <AvatarFallback>
                      <UserIcon className="h-16 w-16" />
                    </AvatarFallback>
                </Avatar>
                {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                        <LoaderCircle className="h-8 w-8 animate-spin text-white" />
                    </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/gif"
                className="hidden"
                disabled={isUploading}
              />
              <Button type="button" variant="outline" onClick={handleAvatarClick} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Change Avatar"}
              </Button>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Email</FormLabel>
              <Input value={profile?.email || ''} disabled />
            </FormItem>
            
            <Button type="submit" disabled={isLoading || isUploading}>
              {(isLoading || isUploading) && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
