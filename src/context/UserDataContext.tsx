
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
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => { wasRewardable: boolean, rewardAmount: number };
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    
    // Use local storage for caching. The hook is now robust.
    const [userProfile, setUserProfile] = useLocalStorage<Partial<UserProfile>>('userProfile', {});
    const [practiceHistory, setPracticeHistory] = useLocalStorage<PracticeHistoryState>('practiceHistory', {});

    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const pendingSyncs = useRef<PracticeHistoryState>({}).current;
    
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
    }, [user, setUserProfile]);

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
    }, [user, setPracticeHistory]);
    
    // Effect to fetch initial data on login or if cache is empty
    useEffect(() => {
        const fetchAllData = async () => {
            if (user && !authLoading) {
                setLoading(true);
                // Only fetch from DB if local state is empty, to prevent overwriting
                if (Object.keys(userProfile).length === 0) {
                    await fetchUserProfile();
                }
                if (Object.keys(practiceHistory).length === 0) {
                    await fetchPracticeHistory();
                }
                setLoading(false);
            } else if (!user && !authLoading) {
                // Clear data on logout
                setUserProfile({});
                setPracticeHistory({});
                setLoading(false);
            }
        }
        fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading]);


    // --- Firestore Synchronization Logic ---
    
    // This debounced function is now ONLY responsible for committing batches to Firestore.
    // It does not modify local state, preventing infinite loops.
    const debouncedCommitToFirestore = useRef(
        debounce(async () => {
            const userUid = auth.currentUser?.uid;
            if (!userUid || Object.keys(pendingSyncs).length === 0) {
                return;
            }

            const batch = writeBatch(db);
            const dataToSync = { ...pendingSyncs };
            // Clear pending syncs immediately to prevent race conditions
            for (const key in pendingSyncs) {
                delete pendingSyncs[key];
            }

            let totalTokensAwardedThisBatch = 0;

            for (const phraseId in dataToSync) {
                const { phraseData, rewardAmount } = dataToSync[phraseId] as any;
                const historyDocRef = doc(db, 'users', userUid, 'practiceHistory', phraseId);
                
                batch.set(historyDocRef, phraseData, { merge: true });
                totalTokensAwardedThisBatch += rewardAmount;
            }

            if (totalTokensAwardedThisBatch > 0) {
                const userDocRef = doc(db, 'users', userUid);
                batch.update(userDocRef, { tokenBalance: increment(totalTokensAwardedThisBatch) });
                
                const logRef = doc(collection(db, `users/${userUid}/transactionLogs`));
                batch.set(logRef, {
                    actionType: 'practice_earn',
                    tokenChange: totalTokensAwardedThisBatch,
                    timestamp: serverTimestamp(),
                    description: `Reward for reaching practice threshold.`
                });
            }
            
            try {
                await batch.commit();
            } catch (error) {
                 console.error("Error committing practice history batch:", error);
            }
        }, 3000)
    ).current;
    
    // --- Public Actions ---

    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs): { wasRewardable: boolean, rewardAmount: number } => {
        if (!user || !settings) return { wasRewardable: false, rewardAmount: 0 };
        const { phraseId, phraseText, lang, isPass, accuracy, settings: currentSettings } = args;

        let wasRewardable = false;
        let rewardAmount = 0;
        
        // Use a functional update to get the most recent state
        setPracticeHistory(currentHistory => {
            const phraseHistory = currentHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };
            const previousPassCount = phraseHistory.passCountPerLang?.[lang] || 0;

            if (isPass) {
                const newPassCount = previousPassCount + 1;
                phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: newPassCount };
                
                // One-time reward check: did the count CROSS the threshold?
                if (previousPassCount < currentSettings.practiceThreshold && newPassCount >= currentSettings.practiceThreshold) {
                    wasRewardable = true;
                    rewardAmount = currentSettings.practiceReward;
                    
                    // Optimistically update the user's token balance in the UI
                    setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) + rewardAmount }));
                }
            } else {
                phraseHistory.failCountPerLang = { ...phraseHistory.failCountPerLang, [lang]: (phraseHistory.failCountPerLang?.[lang] || 0) + 1 };
            }
            
            phraseHistory.lastAccuracyPerLang = { ...phraseHistory.lastAccuracyPerLang, [lang]: accuracy };
            phraseHistory.phraseText = phraseText;

            const updatedHistory = { ...currentHistory, [phraseId]: phraseHistory };

            // Add the final state of this phrase to the pending sync batch
            pendingSyncs[phraseId] = { phraseData: phraseHistory, rewardAmount };
            debouncedCommitToFirestore();
            
            return updatedHistory;
        });

        return { wasRewardable, rewardAmount };

    }, [user, settings, setPracticeHistory, setUserProfile, debouncedCommitToFirestore]);


    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        let correct = 0;
        let tokensEarned = 0;

        if (!settings) return { correct, tokensEarned };

        const topicPhrases = phrasebook.find(t => t.id === topicId)?.phrases.map(p => p.id) || [];
        
        for (const phraseId of topicPhrases) {
            const history = practiceHistory[phraseId];
            const passes = history?.passCountPerLang?.[lang] || 0;
            if (passes > 0) {
                correct++;
            }
            // Check if the one-time reward has been earned
            if (passes >= settings.practiceThreshold) {
                tokensEarned += settings.practiceReward;
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
