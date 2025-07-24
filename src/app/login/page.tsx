
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile as updateAuthProfile,
  type User
} from "firebase/auth";
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { lightweightCountries } from '@/lib/location-data';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { Chrome, LoaderCircle } from 'lucide-react';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const referralId = useMemo(() => searchParams.get('ref'), [searchParams]);

  useEffect(() => {
    getAppSettingsAction().then(setSettings);
  }, []);

  const countryOptions = useMemo(() => lightweightCountries, []);

  const handleCountryChange = (countryCode: string) => {
    const selected = countryOptions.find(c => c.code === countryCode);
    if (selected) {
        setSignupCountry(countryCode);
        if (!signupMobile.startsWith('+')) {
            setSignupMobile(`+${selected.phone} `);
        }
    }
  };

  const createReferralRecord = async (referrerUid: string, newUserId: string) => {
    try {
        const referralRef = doc(collection(db, 'referrals'));
        await setDoc(referralRef, {
            referrerUid,
            referredUid: newUserId,
            status: 'pending', // To be processed by a Cloud Function
            createdAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error creating referral record:", error);
        // This is a non-critical error, so we don't need to show it to the user
    }
  }

  const updateUserProfileInFirestore = async (user: User, data: any, isNewUser: boolean = false) => {
    const userDocRef = doc(db, 'users', user.uid);
    const signupBonus = settings?.signupBonus || 100;
    
    const docSnap = await getDoc(userDocRef);
    const existingData = docSnap.exists() ? docSnap.data() : {};
    
    const lowercasedEmail = user.email!.toLowerCase();

    const dataToSave = { 
        ...existingData,
        ...data, 
        email: lowercasedEmail,
        role: existingData.role || 'user',
        tokenBalance: existingData.tokenBalance ?? (isNewUser ? signupBonus : 0),
        syncLiveUsage: existingData.syncLiveUsage || 0,
        searchableName: (data.name || '').toLowerCase(),
        searchableEmail: lowercasedEmail,
    };

    await setDoc(userDocRef, dataToSave, { merge: true });

    // Log the signup bonus transaction for new users
    if (isNewUser) {
        const logRef = collection(db, 'users', user.uid, 'transactionLogs');
        await addDoc(logRef, {
            actionType: 'signup_bonus',
            tokenChange: signupBonus,
            timestamp: serverTimestamp(),
            description: 'Welcome bonus for signing up!'
        });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);
      const isNewUser = !docSnap.exists();
      
      const displayName = user.displayName || 'New User';

      await updateUserProfileInFirestore(user, {
          name: displayName,
          country: '', 
          mobile: user.phoneNumber || '',
      }, isNewUser);

      if (isNewUser && referralId) {
        await createReferralRecord(referralId, user.uid);
      }

      toast({ title: "Success", description: "Logged in successfully." });
      router.push('/profile');
    } catch (error: any) {
      console.error("Google sign-in error", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupCountry) {
        toast({ variant: "destructive", title: "Error", description: "Please select your country." });
        return;
    }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      const user = userCredential.user;
      
      await updateAuthProfile(user, { displayName: signupName });

      await updateUserProfileInFirestore(user, {
          name: signupName,
          country: signupCountry,
          mobile: signupMobile,
      }, true); // This is a new user

      if (referralId) {
        await createReferralRecord(referralId, user.uid);
      }

      toast({ title: "Success", description: "Account created successfully." });
      router.push('/profile');
    } catch (error: any) {
      console.error("Email sign-up error", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      toast({ title: "Success", description: "Logged in successfully." });
      router.push('/profile');
    } catch (error: any) {
      console.error("Email login error", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!settings) {
     return (
        <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
            <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="space-y-8">
        <header className="flex items-center gap-4">
             <SidebarTrigger />
        </header>

        <div className="flex justify-center items-center">
            <Tabs defaultValue="login" className="w-full max-w-md">
                <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                <Card>
                    <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>Access your account to see your progress.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleEmailLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <Input id="login-email" type="email" placeholder="m@example.com" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
                        <Input id="login-password" type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-4">
                        <Button className="w-full" type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</Button>
                        <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>
                        <Chrome className="mr-2 h-4 w-4" /> Sign in with Google
                        </Button>
                    </CardFooter>
                    </form>
                </Card>
                </TabsContent>
                <TabsContent value="signup">
                <Card>
                    <CardHeader>
                    <CardTitle>Sign Up</CardTitle>
                    <CardDescription>Create a new account to start your journey.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleEmailSignUp}>
                        <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="signup-name">Name</Label>
                            <Input id="signup-name" placeholder="Your Name" required value={signupName} onChange={e => setSignupName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-email">Email</Label>
                            <Input id="signup-email" type="email" placeholder="m@example.com" required value={signupEmail} onChange={e => setSignupEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-password">Password</Label>
                            <Input id="signup-password" type="password" required minLength={6} value={signupPassword} onChange={e => setSignupPassword(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-country">Country</Label>
                            <Select onValueChange={handleCountryChange} value={signupCountry} required>
                                <SelectTrigger id="signup-country">
                                    <SelectValue placeholder="Select your country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map(country => (
                                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-mobile">Mobile Number (Optional)</Label>
                            <Input id="signup-mobile" type="tel" placeholder="Your phone number" value={signupMobile} onChange={(e) => setSignupMobile(e.target.value)} />
                        </div>
                        <p className="text-sm text-muted-foreground text-center pt-2">
                            You'll receive {settings.signupBonus} tokens as a welcome bonus!
                        </p>
                        </CardContent>
                        <CardFooter className="flex-col gap-4">
                        <Button className="w-full" type="submit" disabled={isLoading}>{isLoading ? 'Creating account...' : 'Create Account'}</Button>
                        <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>
                            <Chrome className="mr-2 h-4 w-4" /> Sign up with Google
                        </Button>
                        </CardFooter>
                    </form>
                </Card>
                </TabsContent>
            </Tabs>
        </div>
    </div>
  );
}

    