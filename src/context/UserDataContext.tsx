
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
}

interface UserDataContextType {
    user: typeof auth.currentUser | null;
    loading: boolean;
    userProfile: Partial<UserProfile>;
    practiceHistory: PracticeHistoryState;
    settings: AppSettings | null;
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

    const pendingSyncs = useRef<Record<string, { phraseData: PracticeHistoryDoc, rewardAmount: number }>>({}).current;
    
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
                // Always fetch user profile to get latest token balance, etc.
                await fetchUserProfile();
                // Only fetch practice history if it's not in local storage cache
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
    const debouncedCommitToFirestore = useRef(
        debounce(async (dataToSync: any) => {
            const userUid = auth.currentUser?.uid;
            if (!userUid || Object.keys(dataToSync).length === 0) {
                return;
            }

            const batch = writeBatch(db);
            let totalTokensAwardedThisBatch = 0;

            for (const phraseId in dataToSync) {
                const { phraseData, rewardAmount } = dataToSync[phraseId];
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
        const { phraseId, phraseText, lang, isPass, accuracy } = args;

        let wasRewardable = false;
        let rewardAmount = 0;

        const currentPhraseHistory = practiceHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };
        const previousPassCount = currentPhraseHistory.passCountPerLang?.[lang] || 0;
        
        const updatedPhraseHistory: PracticeHistoryDoc = { 
            ...currentPhraseHistory,
            passCountPerLang: { ...currentPhraseHistory.passCountPerLang },
            failCountPerLang: { ...currentPhraseHistory.failCountPerLang },
            lastAccuracyPerLang: { ...currentPhraseHistory.lastAccuracyPerLang },
        };

        if (isPass) {
            const newPassCount = (updatedPhraseHistory.passCountPerLang![lang] || 0) + 1;
            updatedPhraseHistory.passCountPerLang![lang] = newPassCount;

            // One-time reward check: did the count CROSS the threshold?
            if (previousPassCount < settings.practiceThreshold && newPassCount >= settings.practiceThreshold) {
                wasRewardable = true;
                rewardAmount = settings.practiceReward;
                
                // Optimistically update the user's token balance in the UI for instant feedback
                setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) + rewardAmount }));
            }
        } else {
             updatedPhraseHistory.failCountPerLang![lang] = (updatedPhraseHistory.failCountPerLang![lang] || 0) + 1;
        }
        
        updatedPhraseHistory.lastAccuracyPerLang![lang] = accuracy;
        updatedPhraseHistory.phraseText = phraseText;

        const updatedHistory = { ...practiceHistory, [phraseId]: updatedPhraseHistory };
        setPracticeHistory(updatedHistory);

        // Only add to the sync queue if there's an actual change.
        pendingSyncs[phraseId] = { phraseData: updatedPhraseHistory, rewardAmount };
        debouncedCommitToFirestore(pendingSyncs);
        
        return { wasRewardable, rewardAmount };

    }, [user, settings, practiceHistory, setPracticeHistory, setUserProfile, debouncedCommitToFirestore]);


    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        let correct = 0;
        let tokensEarned = 0;

        if (!settings) return { correct, tokensEarned };

        const topicPhrases = phrasebook.find(t => t.id === topicId)?.phrases.map(p => p.id) || [];
        
        for (const phraseId of topicPhrases) {
            const history = practiceHistory[phraseId];
            if (!history) continue;

            const passes = history.passCountPerLang?.[lang] || 0;
            if (passes > 0) {
                correct++;
            }
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
        settings,
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
