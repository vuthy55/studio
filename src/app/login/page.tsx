
"use client";

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { lightweightCountries } from '@/lib/location-data';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { Chrome, LoaderCircle, Award } from 'lucide-react';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { azureLanguages, type AzureLanguageCode } from '@/lib/azure-languages';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserData } from '@/context/UserDataContext';
import { signUpUser } from '@/actions/auth';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, dismiss } = useToast();
  const { user, loading: authLoading } = useUserData();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  const [signupLanguage, setSignupLanguage] = useState<AzureLanguageCode | ''>('');
  
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const referralId = useMemo(() => searchParams.get('ref'), [searchParams]);
  const redirectUrl = useMemo(() => searchParams.get('redirect'), [searchParams]);

  useEffect(() => {
    if (!authLoading && user) {
      if (redirectUrl) {
        router.push(redirectUrl);
      } else {
        router.push('/learn');
      }
    }
  }, [user, authLoading, router, redirectUrl]);

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document already exists
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // This is a new user, create their profile via the server action
        await signUpUser(
            {
                name: user.displayName || 'New User',
                email: user.email!,
                photoURL: user.photoURL || undefined
            },
            referralId,
            null, // No roomId for standard login/signup
            null // No vibeId for standard login/signup
        );
      }
      
      toast({ title: "Welcome!", description: "Logged in successfully." });
      // The useEffect will handle the redirect

    } catch (error: any) {
      console.error("Google sign-in error", error);
      if (error.code === 'auth/account-exists-with-different-credential') {
        toast({ variant: "destructive", title: "Sign-in Error", description: "An account already exists with this email address. Please sign in using the original method." });
      } else if (error.code !== 'auth/popup-closed-by-user') {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupCountry || !signupLanguage) {
        toast({ variant: "destructive", title: "Error", description: "Please select your country and default language." });
        return;
    }
    setIsEmailLoading(true);
    try {
       const result = await signUpUser(
            {
                name: signupName,
                email: signupEmail,
                password: signupPassword,
                country: signupCountry,
                mobile: signupMobile,
                defaultLanguage: signupLanguage
            }, 
            referralId,
            null, // No roomId for standard login/signup
            null // No vibeId for standard login/signup
       );
        
       if (!result.success) {
            throw new Error(result.error || 'An unknown error occurred during signup.');
       }
        
       // Manually sign in the user on the client after successful server-side creation
       await signInWithEmailAndPassword(auth, signupEmail, signupPassword);

       toast({ title: "Success", description: "Account created successfully." });
       // The useEffect will handle the redirect
      
    } catch (error: any) {
      console.error("Email sign-up error", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      toast({ title: "Success", description: "Logged in successfully." });
      // The useEffect will handle the redirect
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential') {
        const { id: toastId } = toast({
          variant: "destructive",
          title: "Login Failed",
          description: "Incorrect email or password. If you don't have an account, you can sign up now.",
          action: (
            <Button variant="secondary" onClick={() => {
              setActiveTab('signup');
              setSignupEmail(loginEmail);
              dismiss(toastId);
            }}>
              Sign Up
            </Button>
          ),
          duration: 10000,
        });
      } else {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    } finally {
      setIsEmailLoading(false);
    }
  };
  
  if (authLoading || (!authLoading && user) || !settings) {
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md">
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
                        <Button className="w-full" type="submit" disabled={isEmailLoading || isGoogleLoading}>
                            {isEmailLoading ? <LoaderCircle className="animate-spin" /> : 'Login'}
                        </Button>
                        <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isEmailLoading || isGoogleLoading}>
                            {isGoogleLoading ? <LoaderCircle className="animate-spin" /> : <Chrome className="mr-2 h-4 w-4" />}
                            Sign in with Google
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
                            <Label htmlFor="signup-language">Default Spoken Language</Label>
                            <Select onValueChange={(v) => setSignupLanguage(v as AzureLanguageCode)} value={signupLanguage} required>
                                <SelectTrigger id="signup-language">
                                    <SelectValue placeholder="Select your language..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-72">
                                        {azureLanguages.map(lang => (
                                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                        ))}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-country">Country</Label>
                            <Select onValueChange={handleCountryChange} value={signupCountry} required>
                                <SelectTrigger id="signup-country">
                                    <SelectValue placeholder="Select your country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countryOptions.map((country: any) => (
                                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-mobile">Mobile Number (Optional)</Label>
                            <Input id="signup-mobile" type="tel" placeholder="Your phone number" value={signupMobile} onChange={(e) => setSignupMobile(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-center gap-2 p-3 text-base font-bold text-primary bg-primary/10 rounded-lg mt-4">
                            <Award className="h-6 w-6" />
                            <span>You'll receive {settings?.signupBonus || '...'} tokens as a welcome bonus!</span>
                        </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-4">
                        <Button className="w-full" type="submit" disabled={isEmailLoading || isGoogleLoading}>
                            {isEmailLoading ? <LoaderCircle className="animate-spin" /> : 'Create Account'}
                        </Button>
                         <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isEmailLoading || isGoogleLoading}>
                             {isGoogleLoading ? <LoaderCircle className="animate-spin" /> : <Chrome className="mr-2 h-4 w-4" />}
                             Sign up with Google
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

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <LoginPageContent />
        </Suspense>
    );
}

