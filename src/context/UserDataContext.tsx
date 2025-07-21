
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import type { UserProfile, PracticeStats } from '@/app/profile/page';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { getAppSettings, type AppSettings } from '@/services/settings';
import { debounce } from 'lodash';

// --- Types ---

type PracticeHistoryDoc = {
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
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => void;
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    const [loading, setLoading] = useState(true);

    const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({});
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryState>({});
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const dataFetchedRef = useRef(false);
    
    // --- Data Fetching ---

    useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (user && !dataFetchedRef.current) {
                setLoading(true);
                dataFetchedRef.current = true; // Mark as fetched to prevent re-fetching on re-renders

                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const historyCollectionRef = collection(db, 'users', user.uid, 'practiceHistory');

                    const [userDocSnap, historySnapshot] = await Promise.all([
                        getDoc(userDocRef),
                        getDocs(historyCollectionRef)
                    ]);

                    // Load Profile
                    if (userDocSnap.exists()) {
                        setUserProfile(userDocSnap.data());
                    }

                    // Load History
                    const historyData: PracticeHistoryState = {};
                    historySnapshot.forEach(doc => {
                        historyData[doc.id] = doc.data();
                    });
                    setPracticeHistory(historyData);

                } catch (error) {
                    console.error("Error fetching user data:", error);
                } finally {
                    setLoading(false);
                }
            } else if (!user) {
                // Reset state on logout
                dataFetchedRef.current = false;
                setUserProfile({});
                setPracticeHistory({});
                setLoading(authLoading);
            }
        };

        fetchData();
    }, [user, authLoading]);

    // --- Client-Side Actions ---

    // Debounce the sync function to bundle multiple quick updates into one.
    const debouncedSync = useCallback(debounce((updates: { profileUpdate: Partial<UserProfile>, historyUpdate: PracticeHistoryState }[]) => {
        if (!user || updates.length === 0) return;

        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);

        let totalTokenChange = 0;
        const combinedHistoryUpdates: PracticeHistoryState = {};

        updates.forEach(({ profileUpdate, historyUpdate }) => {
            if (profileUpdate.tokenBalance) {
                totalTokenChange += (profileUpdate.tokenBalance as any)._operand;
            }
            Object.assign(combinedHistoryUpdates, historyUpdate);
        });

        // Batch history updates
        for (const phraseId in combinedHistoryUpdates) {
            const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
            batch.set(historyDocRef, combinedHistoryUpdates[phraseId], { merge: true });
        }

        // Batch profile update
        if (totalTokenChange > 0) {
            batch.update(userDocRef, { tokenBalance: increment(totalTokenChange) });
        }

        batch.commit().catch(error => {
            console.error("Error syncing data to Firestore:", error);
        });

    }, 3000), [user]);

    const updatesQueue = useRef<{ profileUpdate: Partial<UserProfile>, historyUpdate: PracticeHistoryState }[]>([]);

    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs) => {
        if (!settings) return;
        const { phraseId, phraseText, topicId, lang, isPass, accuracy } = args;

        let tokenChange = 0;
        let didEarnToken = false;
        
        // 1. Update Practice History State LOCALLY for instant UI feedback
        const updatedHistory = { ...practiceHistory };
        const phraseHistory = updatedHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };

        if (isPass) {
            const newPassCount = (phraseHistory.passCountPerLang?.[lang] || 0) + 1;
            phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: newPassCount };
            if (newPassCount > 0 && newPassCount % settings.practiceThreshold === 0) {
                tokenChange = settings.practiceReward;
                didEarnToken = true;
            }
        } else {
            phraseHistory.failCountPerLang = { ...phraseHistory.failCountPerLang, [lang]: (phraseHistory.failCountPerLang?.[lang] || 0) + 1 };
        }
        
        phraseHistory.lastAccuracyPerLang = { ...phraseHistory.lastAccuracyPerLang, [lang]: accuracy };
        phraseHistory.phraseText = phraseText;
        updatedHistory[phraseId] = phraseHistory;
        setPracticeHistory(updatedHistory);

        // 2. Update Profile State LOCALLY if tokens were earned
        if (didEarnToken) {
            setUserProfile(currentProfile => ({
                 ...currentProfile,
                 tokenBalance: (currentProfile.tokenBalance || 0) + tokenChange,
            }));
        }

        // 3. Queue the updates for debounced background sync
        const historyUpdateForSync = {
            [phraseId]: {
                ...phraseHistory,
                lastAttemptPerLang: { 
                    ...(phraseHistory.lastAttemptPerLang || {}),
                    [lang]: serverTimestamp()
                }
            }
        };

        const profileUpdateForSync: Partial<UserProfile> = {};
        if (didEarnToken) {
            profileUpdateForSync.tokenBalance = increment(tokenChange);
        }

        updatesQueue.current.push({ profileUpdate: profileUpdateForSync, historyUpdate: historyUpdateForSync });
        debouncedSync(updatesQueue.current);

    }, [practiceHistory, settings, debouncedSync]);


    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        let correct = 0;
        let tokensEarned = 0;

        const topicPhrases = phrasebook.find(t => t.id === topicId)?.phrases.map(p => p.id) || [];
        
        for (const phraseId of topicPhrases) {
            const history = practiceHistory[phraseId];
            if (history?.passCountPerLang?.[lang] > 0) {
                correct++;
                // Safely check if settings are loaded before calculating earned tokens.
                if (settings) {
                    const passes = history.passCountPerLang[lang];
                    tokensEarned += Math.floor(passes / settings.practiceThreshold) * settings.practiceReward;
                }
            }
        }
        return { correct, tokensEarned };
    }, [practiceHistory, settings]);


    const value = {
        user,
        loading: loading || authLoading,
        userProfile,
        practiceHistory,
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
