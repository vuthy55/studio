
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile as updateAuthProfile
} from "firebase/auth";
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { countries } from 'countries-list';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { Chrome } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [signupMobile, setSignupMobile] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const countryOptions = Object.entries(countries).map(([code, country]) => ({
    value: code,
    label: country.name
  }));

  const updateUserProfileInFirestore = async (userId: string, data: any) => {
    const userDocRef = doc(db, 'users', userId);
    
    const docSnap = await getDoc(userDocRef);
    const existingData = docSnap.exists() ? docSnap.data() : {};

    const dataWithRole = { 
        ...data, 
        role: existingData.role || 'user' 
    };

    await setDoc(userDocRef, dataWithRole, { merge: true });
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
       await updateUserProfileInFirestore(user.uid, {
          name: user.displayName || 'New User',
          email: user.email!,
          country: '', 
          mobile: user.phoneNumber || ''
      });
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

      await updateUserProfileInFirestore(user.uid, {
          name: signupName,
          email: signupEmail,
          country: signupCountry,
          mobile: signupMobile
      });

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

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-8rem)]">
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
                     <Select onValueChange={setSignupCountry} value={signupCountry} required>
                        <SelectTrigger id="signup-country">
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
                    <Label htmlFor="signup-mobile">Mobile Number (Optional)</Label>
                    <Input id="signup-mobile" type="tel" placeholder="+1 123 456 7890" value={signupMobile} onChange={e => setSignupMobile(e.target.value)} />
                  </div>
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
  );
}
