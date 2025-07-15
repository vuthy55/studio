
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from '@/lib/firebase';

import { LoaderCircle, FilePen, Activity, Languages } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import type { AssessmentResult, AssessmentResults } from '../page';
import { languages, phrasebook } from '@/lib/data';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis } from "recharts"


type UserProfile = {
  uid: string;
  name: string;
  email: string;
  avatarUrl: string;
  assessmentResults?: AssessmentResults;
};

export default function ProfilePage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [stats, setStats] = useState<any>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsMessage, setStatsMessage] = useState("Loading stats...");

    const fetchProfile = useCallback(async () => {
        if (!user) return;
        setProfileLoading(true);
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            setProfile(data);
            setDisplayName(data.name);
        }
        setProfileLoading(false);
    }, [user]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user) {
            fetchProfile();
        }
    }, [user, authLoading, router, fetchProfile]);

    const calculateStats = (results: AssessmentResults) => {
        const totalPhrases = phrasebook.flatMap(t => t.phrases).length;
        const languageStats: Record<string, { attempted: number, passed: number, total: number, topics: Record<string, { passed: number, total: number }> }> = {};

        languages.forEach(lang => {
            languageStats[lang.value] = {
                attempted: 0,
                passed: 0,
                total: totalPhrases,
                topics: {}
            };
        });

        for (const phraseId in results) {
            const parts = phraseId.split('-');
            const lang = parts.pop();
            const pId = parts.join('-');
            
            const phraseInfo = phrasebook.flatMap(t => t.phrases.map(p => ({...p, topic: t.id}))).find(p => p.id === pId);

            if (lang && languageStats[lang] && phraseInfo) {
                languageStats[lang].attempted += 1;
                
                const topicId = phraseInfo.topic;
                if (!languageStats[lang].topics[topicId]) {
                    languageStats[lang].topics[topicId] = { passed: 0, total: phrasebook.find(t=>t.id === topicId)?.phrases.length || 0 };
                }

                if (results[phraseId].status === 'pass') {
                    languageStats[lang].passed += 1;
                    languageStats[lang].topics[topicId].passed += 1;
                }
            }
        }
        
        const overallPassed = Object.values(results).filter(r => r.status === 'pass').length;
        const overallAttempted = Object.keys(results).length;
        
        return { totalPhrases, overallPassed, overallAttempted, languageStats };
    };

    const loadAndCalculateStats = useCallback(async () => {
      if (!user) return;
      setStatsLoading(true);
      
      setStatsMessage("Checking local progress...");
      const localResultsRaw = localStorage.getItem('assessmentResults');
      let localResults: AssessmentResults = {};
      if (localResultsRaw) {
        try {
          localResults = JSON.parse(localResultsRaw);
          setStats(calculateStats(localResults));
          setStatsMessage("Local progress loaded. Syncing with cloud...");
        } catch (e) {
          console.error("Failed to parse local results", e);
        }
      }

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      let dbResults: AssessmentResults = {};
      if (userDoc.exists() && userDoc.data().assessmentResults) {
        dbResults = userDoc.data().assessmentResults;
      }

      // Merge local and DB results, preferring 'pass' status
      const mergedResults: AssessmentResults = { ...localResults, ...dbResults };
      Object.keys(mergedResults).forEach(key => {
        const local = localResults[key] as AssessmentResult | undefined;
        const db = dbResults[key] as AssessmentResult | undefined;

        if (local && db) {
            if (local.status === 'pass' || db.status === 'pass') {
                mergedResults[key] = {
                    status: 'pass',
                    accuracy: Math.max(local.accuracy || 0, db.accuracy || 0),
                    fluency: Math.max(local.fluency || 0, db.fluency || 0),
                };
            }
        }
      });
      
      if (Object.keys(mergedResults).length > 0) {
        setStats(calculateStats(mergedResults));
        localStorage.setItem('assessmentResults', JSON.stringify(mergedResults));
        await updateDoc(userRef, { assessmentResults: mergedResults });
      } else if(Object.keys(localResults).length > 0) {
        setStats(calculateStats(localResults));
      }


      setStatsMessage("Stats up to date!");
      setStatsLoading(false);
    }, [user]);

    useEffect(() => {
        if (user) {
            loadAndCalculateStats();
        }
    }, [user, loadAndCalculateStats]);

    const handleSave = async () => {
        if (!profile) return;
        const userRef = doc(db, "users", profile.uid);
        await updateDoc(userRef, { name: displayName });
        setProfile(prev => prev ? { ...prev, name: displayName } : null);
        setIsEditing(false);
    };

    const chartData = useMemo(() => {
        if (!stats) return [];
        return languages
            .map(lang => {
                const langStats = stats.languageStats[lang.value];
                if (!langStats || langStats.attempted === 0) return null;
                return {
                    name: lang.label,
                    mastered: langStats.passed,
                    total: langStats.total,
                };
            })
            .filter(Boolean);
    }, [stats]);

    const chartConfig = {
      mastered: {
        label: "Mastered",
        color: "hsl(var(--chart-1))",
      },
    } satisfies import("@/components/ui/chart").ChartConfig;

    if (authLoading || profileLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!profile) {
        return <p>No profile data found.</p>;
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
            
            <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="account"><FilePen className="mr-2" />My Account</TabsTrigger>
                    <TabsTrigger value="stats"><Activity className="mr-2" />My Stats</TabsTrigger>
                </TabsList>
                <TabsContent value="account">
                    <Card>
                        <CardHeader>
                            <CardTitle>Account Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <div className="relative group">
                                    <Avatar className="h-24 w-24">
                                        <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                                        <AvatarFallback>{profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
                                    </Avatar>
                                </div>
                                <div className="space-y-2 flex-1 w-full">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" value={profile.email} disabled />

                                    <Label htmlFor="name">Name</Label>
                                    <div className="flex gap-2">
                                        <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!isEditing} />
                                        {isEditing ? (
                                            <Button onClick={handleSave}>Save</Button>
                                        ) : (
                                            <Button variant="outline" onClick={() => setIsEditing(true)}>Edit</Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="stats">
                    <Card>
                        <CardHeader>
                            <CardTitle>Your Learning Progress</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                           {statsLoading ? (
                                <div className="flex flex-col items-center justify-center p-8 text-center">
                                    <LoaderCircle className="h-8 w-8 animate-spin text-primary mb-4" />
                                    <p className="text-muted-foreground">{statsMessage}</p>
                                </div>
                            ) : stats && stats.overallAttempted > 0 ? (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                                        <div className="bg-secondary/50 p-4 rounded-lg">
                                            <p className="text-sm text-muted-foreground">Languages Practiced</p>
                                            <p className="text-2xl font-bold">{Object.values(stats.languageStats).filter((l: any) => l.attempted > 0).length}</p>
                                        </div>
                                         <div className="bg-secondary/50 p-4 rounded-lg">
                                            <p className="text-sm text-muted-foreground">Total Phrases Practiced</p>
                                            <p className="text-2xl font-bold">{stats.overallAttempted}</p>
                                        </div>
                                        <div className="bg-secondary/50 p-4 rounded-lg">
                                            <p className="text-sm text-muted-foreground">Phrases Mastered</p>
                                            <p className="text-2xl font-bold">{stats.overallPassed}</p>
                                        </div>
                                        <div className="bg-secondary/50 p-4 rounded-lg">
                                            <p className="text-sm text-muted-foreground">Overall Progress</p>
                                            <p className="text-2xl font-bold">{((stats.overallPassed / (stats.totalPhrases * languages.length)) * 100).toFixed(0)}%</p>
                                        </div>
                                    </div>
                                    
                                    <h3 className="text-lg font-semibold pt-4 flex items-center gap-2"><Languages /> Language Mastery</h3>
                                    <div className="space-y-4">
                                        {Object.entries(stats.languageStats).map(([lang, data]: [string, any]) => {
                                            if (data.attempted === 0) return null;
                                            const langDetails = languages.find(l => l.value === lang);
                                            const progress = (data.passed / data.total) * 100;
                                            return (
                                                <div key={lang}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <Label>{langDetails?.label}</Label>
                                                        <span className="text-sm text-muted-foreground">{data.passed} / {data.total} phrases</span>
                                                    </div>
                                                    <Progress value={progress} />
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {chartData && chartData.length > 0 && (
                                    <div className="h-[250px] w-full mt-8">
                                       <ChartContainer config={chartConfig} className="w-full h-full">
                                          <BarChart
                                            accessibilityLayer
                                            data={chartData}
                                            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                          >
                                            <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                            <YAxis tickLine={false} axisLine={false} />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar dataKey="mastered" fill="var(--color-mastered)" radius={4} />
                                          </BarChart>
                                        </ChartContainer>
                                    </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center p-8">
                                    <p className="text-muted-foreground">You haven't practiced any phrases yet. Head over to the Learn tab to get started!</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
