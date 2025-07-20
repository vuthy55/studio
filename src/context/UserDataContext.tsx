
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import type { UserProfile, PracticeStats } from '@/app/profile/page';
import type { LanguageCode } from '@/lib/data';
import type { AppSettings } from '@/services/settings';
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

    const dataFetchedRef = useRef(false);
    const practicedPhrasesThisSession = useRef(new Set<string>());

    // --- Background Sync Logic ---

    const queueForSync = useRef<{ profile: Partial<UserProfile>, history: PracticeHistoryState }>({ profile: {}, history: {} });

    const syncToFirestore = useCallback(async () => {
        if (!user || (Object.keys(queueForSync.current.profile).length === 0 && Object.keys(queueForSync.current.history).length === 0)) {
            return;
        }

        console.log("[DEBUG] Background Sync: Starting sync to Firestore", queueForSync.current);
        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);

        // Sync Profile and Stats
        if (Object.keys(queueForSync.current.profile).length > 0) {
            batch.set(userDocRef, queueForSync.current.profile, { merge: true });
        }

        // Sync Practice History
        for (const phraseId in queueForSync.current.history) {
            const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
            batch.set(historyDocRef, queueForSync.current.history[phraseId], { merge: true });
        }

        try {
            await batch.commit();
            console.log("[DEBUG] Background Sync: Sync successful.");
            // Clear the queue after successful sync
            queueForSync.current = { profile: {}, history: {} };
        } catch (error) {
            console.error("Error syncing data to Firestore:", error);
        }
    }, [user]);

    const debouncedSync = useCallback(debounce(syncToFirestore, 5000), [syncToFirestore]);

    // --- Data Fetching ---

    useEffect(() => {
        const fetchData = async () => {
            if (user && !dataFetchedRef.current) {
                console.log("[DEBUG] Initial Load: Fetching user data from Firestore.");
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
                    console.log("[DEBUG] Initial Load: Client state initialized from Firestore.", { profile: userDocSnap.data(), history: historyData });

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
                practicedPhrasesThisSession.current.clear();
                setLoading(authLoading);
            }
        };

        fetchData();
    }, [user, authLoading]);

    // --- Client-Side Actions ---

    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs) => {
        const { phraseId, phraseText, topicId, lang, isPass, accuracy, settings } = args;
        
        // --- 1. Update Practice History State ---
        const updatedHistory = { ...practiceHistory };
        const phraseHistory = updatedHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };
        
        if (isPass) {
            phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: (phraseHistory.passCountPerLang?.[lang] || 0) + 1 };
        } else {
            phraseHistory.failCountPerLang = { ...phraseHistory.failCountPerLang, [lang]: (phraseHistory.failCountPerLang?.[lang] || 0) + 1 };
        }
        
        phraseHistory.lastAccuracyPerLang = { ...phraseHistory.lastAccuracyPerLang, [lang]: accuracy };
        phraseHistory.phraseText = phraseText;
        updatedHistory[phraseId] = phraseHistory;
        
        setPracticeHistory(updatedHistory);
        
        // --- 2. Update User Profile & Stats State ---
        const updatedProfile = { ...userProfile };
        updatedProfile.practiceStats = updatedProfile.practiceStats ? { ...updatedProfile.practiceStats } : { byLanguage: {}, byTopic: {} };
        updatedProfile.practiceStats.byLanguage = updatedProfile.practiceStats.byLanguage ? { ...updatedProfile.practiceStats.byLanguage } : {};
        updatedProfile.practiceStats.byTopic = updatedProfile.practiceStats.byTopic ? { ...updatedProfile.practiceStats.byTopic } : {};

        // Update practiced count (only once per session for a given phrase/language combo)
        const practiceKey = `${phraseId}-${lang}`;
        if (!practicedPhrasesThisSession.current.has(practiceKey)) {
             if (!updatedProfile.practiceStats.byLanguage[lang]) updatedProfile.practiceStats.byLanguage[lang] = { practiced: 0, correct: 0 };
             updatedProfile.practiceStats.byLanguage[lang].practiced = (updatedProfile.practiceStats.byLanguage[lang].practiced || 0) + 1;
             practicedPhrasesThisSession.current.add(practiceKey);
        }
        
        let earnedTokens = 0;
        if (isPass) {
            // Update correct count
            if (!updatedProfile.practiceStats.byLanguage[lang]) updatedProfile.practiceStats.byLanguage[lang] = { practiced: 0, correct: 0 };
            updatedProfile.practiceStats.byLanguage[lang].correct = (updatedProfile.practiceStats.byLanguage[lang].correct || 0) + 1;

            if (!updatedProfile.practiceStats.byTopic[topicId]) updatedProfile.practiceStats.byTopic[topicId] = {};
            if (!updatedProfile.practiceStats.byTopic[topicId][lang]) updatedProfile.practiceStats.byTopic[topicId][lang] = { correct: 0, tokensEarned: 0 };
            updatedProfile.practiceStats.byTopic[topicId][lang].correct = (updatedProfile.practiceStats.byTopic[topicId][lang].correct || 0) + 1;

            // Check for token reward
            const passCount = phraseHistory.passCountPerLang?.[lang] || 0;
            if (passCount > 0 && passCount % settings.practiceThreshold === 0) {
                earnedTokens = settings.practiceReward;
                updatedProfile.tokenBalance = (updatedProfile.tokenBalance || 0) + earnedTokens;
                updatedProfile.practiceStats.byTopic[topicId][lang].tokensEarned = (updatedProfile.practiceStats.byTopic[topicId][lang].tokensEarned || 0) + earnedTokens;
            }
        }
        
        setUserProfile(updatedProfile);

        console.log("[DEBUG] Client-Side Update: State updated instantly.", { updatedProfile, updatedHistory });
        
        // --- 3. Queue changes for background sync ---
        queueForSync.current.profile = { 
            ...queueForSync.current.profile, 
            tokenBalance: updatedProfile.tokenBalance,
            practiceStats: updatedProfile.practiceStats,
        };
        queueForSync.current.history[phraseId] = {
            ...queueForSync.current.history[phraseId],
            ...phraseHistory,
             lastAttemptPerLang: { 
                ...(queueForSync.current.history[phraseId]?.lastAttemptPerLang || {}),
                [lang]: serverTimestamp()
            }
        };

        debouncedSync();

    }, [practiceHistory, userProfile, debouncedSync]);

    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        const stats = userProfile.practiceStats?.byTopic?.[topicId]?.[lang];
        return {
            correct: stats?.correct || 0,
            tokensEarned: stats?.tokensEarned || 0,
        };
    }, [userProfile.practiceStats]);


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
