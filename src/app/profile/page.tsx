
"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from '@/lib/firebase';
import { useUser } from '@/hooks/use-user';
import { LoaderCircle, User as UserIcon, Upload, Sparkles, LogOut, Info, Languages, CheckCircle2, XCircle, Volume2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { CountrySelect } from '@/components/ui/country-select';
import { generateAvatar } from '@/ai/flows/generate-avatar-flow';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Progress } from '@/components/ui/progress';
import { phrasebook, languages as allLanguages, type LanguageCode, type Phrase } from '@/lib/data';
import type { AssessmentResult, AssessmentResults } from '@/app/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { generateSpeech } from '@/ai/flows/tts-flow';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';

type LanguageStats = {
    language: string;
    langCode: LanguageCode;
    passed: number;
    total: number;
    percentage: number;
};


const StatsDialog = ({ 
    language, 
    langCode, 
    initialAssessmentResults,
    onResultsChange 
}: { 
    language: string, 
    langCode: LanguageCode, 
    initialAssessmentResults: AssessmentResults,
    onResultsChange: (newResults: AssessmentResults) => void;
}) => {
    const [localResults, setLocalResults] = useState(initialAssessmentResults);
    const [assessingPhraseId, setAssessingPhraseId] = useState<string | null>(null);
    const { toast } = useToast();

    // Ensure local state updates if the prop changes from outside
    useEffect(() => {
        setLocalResults(initialAssessmentResults);
    }, [initialAssessmentResults]);

    const sortedPhrases = useMemo(() => {
        const getScore = (result?: AssessmentResult) => {
            if (!result) return 1;
            if (result.status === 'fail') return 0;
            if (result.status === 'pass') return 2;
            return 1;
        };

        const allPhrasesInLang = phrasebook.flatMap(topic => topic.phrases);
        
        return [...allPhrasesInLang].sort((a, b) => {
            const resultA = localResults[`${a.id}-${langCode}`];
            const resultB = localResults[`${b.id}-${langCode}`];
            return getScore(resultA) - getScore(resultB);
        });
    }, [langCode, localResults]);
    
    const getTranslation = (phrase: Phrase, lang: LanguageCode) => {
        if (lang === 'english' || !phrase.translations[lang]) {
            return phrase.english;
        }
        return phrase.translations[lang]!;
    };
    
    const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
        english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
        malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
        chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
    };

    const handlePlayAudio = async (text: string, lang: LanguageCode) => {
        if (!text || assessingPhraseId) return;
        const locale = languageToLocaleMap[lang];
        
        try {
            const response = await generateSpeech({ text, lang: locale || 'en-US' });
            const audio = new Audio(response.audioDataUri);
            audio.play().catch(e => console.error("Audio playback failed.", e));
        } catch (error) {
            console.error("TTS generation failed.", error);
            toast({
                variant: 'destructive',
                title: 'Error generating audio',
                description: 'Could not generate audio for the selected language.',
            });
        }
    };
    
    const assessPronunciation = async (phraseId: string, referenceText: string, lang: LanguageCode) => {
        const azureKey = process.env.NEXT_PUBLIC_AZURE_TTS_KEY;
        const azureRegion = process.env.NEXT_PUBLIC_AZURE_TTS_REGION;
        
        if (!azureKey || !azureRegion) {
          toast({ variant: 'destructive', title: 'Config Error', description: 'Azure credentials not configured.' });
          return;
        }

        const locale = languageToLocaleMap[lang];
        if (!locale) {
          toast({ variant: 'destructive', title: 'Unsupported Language' });
          return;
        }

        setAssessingPhraseId(phraseId);

        let recognizer: sdk.SpeechRecognizer | undefined;
        const previousResult = localResults[phraseId];
        let finalResult: AssessmentResult = { status: 'fail', accuracy: 0, fluency: 0, correctCount: previousResult?.correctCount || 0 };
        
        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
            speechConfig.speechRecognitionLanguage = locale;
            const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
            const pronunciationConfig = sdk.PronunciationAssessmentConfig.fromJSON(JSON.stringify({
                referenceText: referenceText,
                gradingSystem: "HundredMark",
                granularity: "Phoneme",
                enableMiscue: true,
            }));
            recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
            pronunciationConfig.applyTo(recognizer);
            
            const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
                recognizer!.recognizeOnceAsync(resolve, reject);
            });
            
            if (result && result.reason === sdk.ResultReason.RecognizedSpeech && result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)) {
                const parsedResult = JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)!);
                const assessment = parsedResult.NBest?.[0]?.PronunciationAssessment;
                if (assessment) {
                    const accuracyScore = assessment.AccuracyScore;
                    const isPass = accuracyScore > 70;
                    finalResult = {
                        status: isPass ? 'pass' : 'fail',
                        accuracy: accuracyScore,
                        fluency: assessment.FluencyScore,
                        correctCount: isPass ? (previousResult?.correctCount || 0) + 1 : previousResult?.correctCount || 0,
                    };
                }
            } else {
                 finalResult.status = 'fail';
            }
        } catch (error) {
            console.error("Error during assessment:", error);
            finalResult.status = 'fail';
        } finally {
            if (recognizer) recognizer.close();
            const newResults = { ...localResults, [phraseId]: finalResult };
            setLocalResults(newResults);
            onResultsChange(newResults); // Propagate change up
            setAssessingPhraseId(null);
        }
    };

    const passedCount = useMemo(() => {
        return Object.keys(localResults).filter(key => key.endsWith(`-${langCode}`) && localResults[key]?.status === 'pass').length
    }, [localResults, langCode]);
    
    const totalCount = useMemo(() => {
        return phrasebook.flatMap(topic => topic.phrases).length;
    }, []);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <div className="space-y-2 cursor-pointer group">
                    <div className="flex justify-between items-baseline">
                        <h4 className="font-semibold group-hover:text-primary transition-colors">{language}</h4>
                        <p className="text-sm text-muted-foreground">{passedCount} / {totalCount}</p>
                    </div>
                    <Progress value={(passedCount / totalCount) * 100} />
                </div>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{language} Progress</DialogTitle>
                    <DialogDescription>
                        Review and practice your phrases. Failed items are at the top.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-96 pr-4">
                    <div className="space-y-3">
                        {sortedPhrases.map(phrase => {
                            const phraseId = `${phrase.id}-${langCode}`;
                            const result = localResults[phraseId];
                            const translatedText = getTranslation(phrase, langCode);
                            const isCurrentlyAssessingThis = assessingPhraseId === phraseId;

                            return (
                                <div key={phrase.id} className="flex flex-col p-3 rounded-md bg-muted/50 gap-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">{translatedText}</p>
                                            <p className="text-sm text-muted-foreground">{phrase.english}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(result?.correctCount || 0) > 0 && <Badge variant="secondary">{result?.correctCount}</Badge>}
                                            {result?.status === 'pass' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                            {result?.status === 'fail' && <XCircle className="h-5 w-5 text-red-500" />}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-muted pt-2">
                                         {(result?.accuracy) && (
                                            <div className="text-xs text-muted-foreground">
                                                <span>Acc: {result.accuracy.toFixed(0)}%</span>
                                            </div>
                                         )}
                                        <div className="flex items-center ml-auto">
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePlayAudio(translatedText, langCode)} disabled={!!assessingPhraseId}>
                                                <Volume2 className="h-4 w-4" />
                                            </Button>
                                             <Button size="icon" variant={isCurrentlyAssessingThis ? "destructive" : "ghost"} className="h-7 w-7" onClick={() => assessPronunciation(phraseId, translatedText, langCode)} disabled={assessingPhraseId !== null && !isCurrentlyAssessingThis}>
                                                {isCurrentlyAssessingThis ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
                 <DialogClose asChild>
                    <Button type="button" variant="secondary">
                        Close
                    </Button>
                </DialogClose>
            </DialogContent>
        </Dialog>
    );
};


const StatsDisplay = ({ assessmentResults, onResultsChange }: { assessmentResults: AssessmentResults, onResultsChange: (newResults: AssessmentResults) => void }) => {
    const stats = useMemo(() => {
        const languageStats: LanguageStats[] = allLanguages
            .map(lang => {
                if (lang.value === 'english') return null;

                const allPhrasesInLang = phrasebook.flatMap(topic => topic.phrases);
                const totalPhrases = allPhrasesInLang.length;
                
                const passedPhrases = allPhrasesInLang.filter(phrase => {
                    const phraseId = `${phrase.id}-${lang.value}`;
                    return assessmentResults[phraseId]?.status === 'pass';
                }).length;

                return {
                    language: lang.label,
                    langCode: lang.value,
                    passed: passedPhrases,
                    total: totalPhrases,
                    percentage: totalPhrases > 0 ? (passedPhrases / totalPhrases) * 100 : 0,
                };
            })
            .filter((s): s is LanguageStats => s !== null && s.total > 0 && s.passed > 0);

        const totalPassed = languageStats.reduce((sum, stat) => sum + stat.passed, 0);
        
        return { languageStats, totalPassed };
    }, [assessmentResults]);

    if (!stats.languageStats.length || stats.totalPassed === 0) {
        return (
             <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
                <Languages className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-semibold">No stats yet!</h3>
                <p>Start learning in the "Learn" tab to see your progress here.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                 <CardHeader>
                    <CardTitle>Phrases Mastered</CardTitle>
                    <CardDescription>
                        You've mastered a total of <span className="font-bold text-primary">{stats.totalPassed}</span> phrases across all languages.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {stats.languageStats.map(stat => (
                       <StatsDialog 
                            key={stat.language} 
                            language={stat.language}
                            langCode={stat.langCode}
                            initialAssessmentResults={assessmentResults} 
                            onResultsChange={onResultsChange}
                        />
                   ))}
                </CardContent>
            </Card>
        </div>
    );
};


export default function ProfilePage() {
    const [user, authLoading, authError] = useAuthState(auth);
    const { profile, loading: profileLoading } = useUser(user?.uid);
    const router = useRouter();
    const { toast } = useToast();
    const { isMobile } = useSidebar();
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [name, setName] = useState('');
    const [country, setCountry] = useState('');
    const [mobile, setMobile] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [assessmentResults, setAssessmentResults] = useState<AssessmentResults>({});
    
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
            setMobile(profile.mobile || '');
            setAssessmentResults(profile.assessmentResults || {});
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
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleAvatarUpdate = async (newAvatarUrl: string, isRealPhoto: boolean = false) => {
        if (!user) return;
        try {
            const userRef = doc(db, 'users', user.uid);
            
            const dataToUpdate: { avatarUrl: string, realPhotoUrl?: string } = { avatarUrl: newAvatarUrl };
            if (isRealPhoto) {
                dataToUpdate.realPhotoUrl = newAvatarUrl;
            }
            
            await updateDoc(userRef, dataToUpdate);
            toast({ title: 'Success', description: 'Avatar updated successfully.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update avatar.' });
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        try {
            const resizedBlob = await new Promise<Blob>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (!e.target?.result) {
                        return reject(new Error("FileReader did not return a result."));
                    }
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
                        if (!ctx) return reject(new Error('Could not get canvas context'));
                        
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob((blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error('Canvas to Blob conversion failed'));
                        }, 'image/jpeg', 0.9);
                    };
                    img.onerror = (err) => reject(err);
                    img.src = e.target.result as string;
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });

            const storageRef = ref(storage, `avatars/${user.uid}/profile.jpg`);
            const snapshot = await uploadBytes(storageRef, resizedBlob);
            const downloadURL = await getDownloadURL(snapshot.ref);

            await handleAvatarUpdate(downloadURL, true);
            toast({ title: 'Success', description: 'New photo uploaded.' });

        } catch (error) {
            toast({ variant: 'destructive', title: 'Upload Error', description: 'Failed to upload new photo.' });
        } finally {
            setIsUploading(false);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    
    const handleGenerateAvatar = async () => {
        if (!user || !profile) return;
        setIsGenerating(true);
        try {
            const result = await generateAvatar({
                userName: name,
                baseImageUrl: profile?.avatarUrl
            });

            const response = await fetch(result.imageDataUri);
            const blob = await response.blob();
            
            const storageRef = ref(storage, `avatars/${user.uid}/ai-generated-avatar.png`);
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);

            await handleAvatarUpdate(downloadURL);
            
        } catch (error) {
            toast({ variant: 'destructive', title: 'AI Avatar Error', description: 'Could not generate or save AI avatar.' });
        } finally {
            setIsGenerating(false);
        }
    };
    
    // Debounced Firestore update
    const handleResultsChange = useCallback((newResults: AssessmentResults) => {
        setAssessmentResults(newResults); // Update UI immediately
        localStorage.setItem('assessmentResults', JSON.stringify(newResults));

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        if (user) {
            debounceTimeoutRef.current = setTimeout(async () => {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    await updateDoc(userRef, { assessmentResults: newResults });
                } catch (error) {
                    console.error("Failed to save progress to Firestore:", error);
                }
            }, 3000); // 3-second debounce
        }
    }, [user]);

    const handleLogout = () => {
        auth.signOut();
        router.push('/login');
    };

    const avatarFallback = useMemo(() => {
        return name ? name.charAt(0).toUpperCase() : <UserIcon />;
    }, [name]);
    
    const loading = authLoading || profileLoading;

    const AvatarInfoContent = () => (
        <p className="text-sm">
            You can upload a real photo or generate a unique AI avatar based on your current picture.
            Only the most recent photo and avatar are saved to keep things tidy. Uploading a new one will replace the old one.
        </p>
    );

    const AvatarInfo = () => {
        if (isMobile) {
            return (
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-accent cursor-help">
                            <Info className="h-5 w-5" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>How Avatars Work</DialogTitle>
                            <DialogDescription asChild>
                               <div><AvatarInfoContent /></div>
                            </DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>
            );
        }

        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-accent cursor-help">
                            <Info className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="right">
                        <p className="font-bold text-base mb-2">How Avatars Work</p>
                        <AvatarInfoContent />
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

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
             <header className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                     {isMobile && <SidebarTrigger />}
                    <Avatar className="w-24 h-24 border-4 border-primary/50 text-4xl">
                        <AvatarImage src={profile.avatarUrl} alt={name} />
                        <AvatarFallback className="bg-muted">{avatarFallback}</AvatarFallback>
                    </Avatar>
                     <div>
                        <h1 className="text-3xl font-bold font-headline">{name}</h1>
                        <p className="text-muted-foreground">{user.email}</p>
                    </div>
                </div>
                 <Button onClick={handleLogout} variant="outline" size="sm" className="hidden sm:flex"><LogOut className="mr-2" /> Logout</Button>
            </header>
            
            <Card>
                 <CardHeader>
                    <CardTitle>Avatar Settings</CardTitle>
                     <CardDescription>Upload a photo or generate a unique AI avatar.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
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
                            <AvatarInfo />
                        </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList>
                    <TabsTrigger value="profile">My Profile</TabsTrigger>
                    <TabsTrigger value="stats">My Stats</TabsTrigger>
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
                                    <div className="space-y-2">
                                        <Label htmlFor="mobile">Mobile (Optional)</Label>
                                        <Input id="mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Your mobile number" />
                                    </div>
                                </div>
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? <LoaderCircle className="animate-spin" /> : 'Save Changes'}
                                </Button>
                            </CardContent>
                        </form>
                    </Card>
                </TabsContent>
                 <TabsContent value="stats">
                    <Card>
                        <CardHeader>
                            <CardTitle>Learning Statistics</CardTitle>
                            <CardDescription>Track your pronunciation progress across different languages.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <StatsDisplay assessmentResults={assessmentResults} onResultsChange={handleResultsChange} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
