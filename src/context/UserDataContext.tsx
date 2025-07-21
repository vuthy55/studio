
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import type { UserProfile } from '@/app/profile/page';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { getAppSettings, type AppSettings } from '@/services/settings';
import { debounce } from 'lodash';
import useLocalStorage from '@/hooks/use-local-storage';

// --- Types ---

export type PracticeHistoryDoc = {
    phraseText?: string;
    passCountPerLang?: Record<string, number>;
    failCountPerLang?: Record<string, number>;
    lastAttemptPerLang?: Record<string, any>;
    lastAccuracyPerLang?: Record<string, number>;
};
export type PracticeHistoryState = Record<string, PracticeHistoryDoc>;

interface RecordPracticeAttemptArgs {
    phraseId: string;
    phraseText: string;
    topicId: string;
    lang: LanguageCode;
    isPass: boolean;
    accuracy: number;
    settings: AppSettings;
}

interface UserDataContextType {
    user: typeof auth.currentUser | null;
    loading: boolean;
    userProfile: Partial<UserProfile>;
    practiceHistory: PracticeHistoryState;
    fetchUserProfile: () => Promise<void>;
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => void;
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    
    // Use local storage for caching
    const [userProfile, setUserProfile] = useLocalStorage<Partial<UserProfile>>('userProfile', {});
    const [practiceHistory, setPracticeHistory] = useLocalStorage<PracticeHistoryState>('practiceHistory', {});

    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    
    // --- Data Fetching ---

    useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);

    const fetchUserProfile = useCallback(async () => {
        if (!user) return;
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                setUserProfile(userDocSnap.data());
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
        }
    }, [user]);

    const fetchPracticeHistory = useCallback(async () => {
        if (!user) return;
        try {
            const historyCollectionRef = collection(db, 'users', user.uid, 'practiceHistory');
            const historySnapshot = await getDocs(historyCollectionRef);
            const historyData: PracticeHistoryState = {};
            historySnapshot.forEach(doc => {
                historyData[doc.id] = doc.data();
            });
            setPracticeHistory(historyData);
        } catch (error) {
            console.error("Error fetching practice history:", error);
        }
    }, [user]);

    useEffect(() => {
        const fetchAllData = async () => {
            if (user && !authLoading) {
                setLoading(true);
                await Promise.all([fetchUserProfile(), fetchPracticeHistory()]);
                setLoading(false);
            } else if (!user && !authLoading) {
                setUserProfile({});
                setPracticeHistory({});
                setLoading(false);
            }
        }
        fetchAllData();
    }, [user, authLoading, fetchUserProfile, fetchPracticeHistory]);


    // --- Client-Side Actions ---

    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs) => {
        if (!user || !settings) return;
        const { phraseId, phraseText, lang, isPass, accuracy } = args;

        setPracticeHistory(currentHistory => {
            const newHistory = { ...currentHistory };
            const phraseHistory = newHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };

            if (isPass) {
                const newPassCount = (phraseHistory.passCountPerLang?.[lang] || 0) + 1;
                phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: newPassCount };

                if (newPassCount > 0 && newPassCount % settings.practiceThreshold === 0) {
                     setUserProfile(currentProfile => ({
                        ...currentProfile,
                        tokenBalance: (currentProfile.tokenBalance || 0) + settings.practiceReward,
                    }));
                }
            } else {
                phraseHistory.failCountPerLang = { ...phraseHistory.failCountPerLang, [lang]: (phraseHistory.failCountPerLang?.[lang] || 0) + 1 };
            }
            
            phraseHistory.lastAccuracyPerLang = { ...phraseHistory.lastAccuracyPerLang, [lang]: accuracy };
            phraseHistory.phraseText = phraseText;
            newHistory[phraseId] = phraseHistory;
            return newHistory;
        });

        debouncedSync.current(args);

    }, [user, settings, setPracticeHistory, setUserProfile]);

    const debouncedSync = useRef(
        debounce((args: RecordPracticeAttemptArgs) => {
            if (!auth.currentUser || !settings) return;

            const { phraseId, lang, isPass } = args;
            const batch = writeBatch(db);
            const userDocRef = doc(db, 'users', auth.currentUser.uid);
            const historyDocRef = doc(db, 'users', auth.currentUser.uid, 'practiceHistory', phraseId);

            const passIncrement = isPass ? 1 : 0;
            const failIncrement = isPass ? 0 : 1;

            const historyUpdateData = {
                phraseText: args.phraseText,
                [`passCountPerLang.${lang}`]: increment(passIncrement),
                [`failCountPerLang.${lang}`]: increment(failIncrement),
                [`lastAttemptPerLang.${lang}`]: serverTimestamp(),
                [`lastAccuracyPerLang.${lang}`]: args.accuracy,
            };

            batch.set(historyDocRef, historyUpdateData, { merge: true });

            getDoc(historyDocRef).then(historySnap => {
                const currentPasses = historySnap.data()?.passCountPerLang?.[lang] || 0;
                if (isPass && (currentPasses + 1) % settings.practiceThreshold === 0) {
                    batch.update(userDocRef, { tokenBalance: increment(settings.practiceReward) });
                     const logRef = doc(collection(db, `users/${auth.currentUser!.uid}/transactionLogs`));
                     batch.set(logRef, {
                        actionType: 'practice_earn',
                        tokenChange: settings.practiceReward,
                        timestamp: serverTimestamp(),
                        description: `Reward for practicing: "${args.phraseText}"`
                    });
                }
                
                batch.commit().catch(error => {
                    console.error("Error syncing debounced data to Firestore:", error);
                });
            });
        }, 3000)
    );


    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        let correct = 0;
        let tokensEarned = 0;

        if (!settings) return { correct, tokensEarned };

        const topicPhrases = phrasebook.find(t => t.id === topicId)?.phrases.map(p => p.id) || [];
        
        for (const phraseId of topicPhrases) {
            const history = practiceHistory[phraseId];
            if (history?.passCountPerLang?.[lang] > 0) {
                correct++;
                const passes = history.passCountPerLang[lang];
                tokensEarned += Math.floor(passes / settings.practiceThreshold) * settings.practiceReward;
            }
        }
        return { correct, tokensEarned };
    }, [practiceHistory, settings]);


    const value = {
        user,
        loading: loading || authLoading,
        userProfile,
        practiceHistory,
        fetchUserProfile,
        recordPracticeAttempt,
        getTopicStats
    };

    return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

// --- Hook ---

export const useUserData = () => {
    const context = useContext(UserDataContext);
    if (context === undefined) {
        throw new Error('useUserData must be used within a UserDataProvider');
    }
    return context;
};
