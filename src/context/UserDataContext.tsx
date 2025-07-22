
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

const UserDataContext = createContext<UserDataDataContextType | undefined>(undefined);

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

    useEffect(() => {
        const fetchAllData = async () => {
            if (user && !authLoading) {
                setLoading(true);
                await fetchUserProfile();
                await fetchPracticeHistory();
                setLoading(false);
            } else if (!user && !authLoading) {
                // Clear data on logout
                setUserProfile({});
                setPracticeHistory({});
                setLoading(false);
            }
        }
        fetchAllData();
    }, [user, authLoading, fetchUserProfile, fetchPracticeHistory, setUserProfile, setPracticeHistory]);


    // --- Client-Side Actions ---

    const debouncedSync = useRef(
        debounce(async (updatedHistoryForSync: PracticeHistoryState) => {
            if (!auth.currentUser || !settings) return;

            const batch = writeBatch(db);
            const userDocRef = doc(db, 'users', auth.currentUser.uid);

            let totalTokensAwardedThisBatch = 0;

            // Iterate over the changed phrases in the local history
            for (const phraseId in updatedHistoryForSync) {
                const localPhraseHistory = updatedHistoryForSync[phraseId];
                
                // Get the DB state from our local cache to avoid a read
                const dbPhraseHistory = practiceHistory[phraseId] || {}; 

                for (const lang in localPhraseHistory.passCountPerLang) {
                     const localPasses = localPhraseHistory.passCountPerLang[lang as LanguageCode] || 0;
                     const dbPasses = dbPhraseHistory.passCountPerLang?.[lang as LanguageCode] || 0;

                    // This is the "cross the threshold" check for the one-time reward
                     if (dbPasses < settings.practiceThreshold && localPasses >= settings.practiceThreshold) {
                         totalTokensAwardedThisBatch += settings.practiceReward;
                     }
                }
                
                // Update the history document in Firestore
                const historyDocRef = doc(db, 'users', auth.currentUser.uid, 'practiceHistory', phraseId);
                const historyUpdateData = {
                    ...localPhraseHistory,
                    lastAttemptPerLang: {
                        ...localPhraseHistory.lastAttemptPerLang,
                        // Add server timestamps for any new attempts.
                        ...Object.keys(localPhraseHistory.passCountPerLang || {}).reduce((acc, lang) => {
                            acc[lang] = serverTimestamp();
                            return acc;
                        }, {} as Record<string, any>),
                    }
                };
                batch.set(historyDocRef, historyUpdateData, { merge: true });
            }

            if (totalTokensAwardedThisBatch > 0) {
                batch.update(userDocRef, { tokenBalance: increment(totalTokensAwardedThisBatch) });

                const logRef = doc(collection(db, `users/${auth.currentUser.uid}/transactionLogs`));
                batch.set(logRef, {
                    actionType: 'practice_earn',
                    tokenChange: totalTokensAwardedThisBatch,
                    timestamp: serverTimestamp(),
                    description: `Reward for reaching practice threshold on ${Object.keys(updatedHistoryForSync).length} phrase(s).`
                });
            }

            try {
                await batch.commit();
            } catch (error) {
                 console.error("Error committing practice history batch:", error);
            }

        }, 3000)
    );

    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs) => {
        if (!user || !settings) return;
        const { phraseId, phraseText, lang, isPass, accuracy } = args;

        let wasRewardable = false;
        
        // Optimistically update the local state for immediate UI feedback
        const updatedHistory = { ...practiceHistory };
        const phraseHistory = updatedHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };
        
        const previousPassCount = phraseHistory.passCountPerLang?.[lang] || 0;

        if (isPass) {
            const newPassCount = previousPassCount + 1;
            phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: newPassCount };
            
            // Check for one-time reward condition
            if (previousPassCount < settings.practiceThreshold && newPassCount >= settings.practiceThreshold) {
                wasRewardable = true;
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
        updatedHistory[phraseId] = phraseHistory;
        
        setPracticeHistory(updatedHistory);

        // Debounce the call to Firestore, sending only the changed data
        debouncedSync.current({ [phraseId]: phraseHistory });

        return { wasRewardable, rewardAmount: settings.practiceReward };

    }, [user, settings, practiceHistory, setPracticeHistory, setUserProfile, debouncedSync]);


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
        recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => {
            const result = recordPracticeAttempt(args);
            // This return is just for the toast, not used elsewhere
            return result || { wasRewardable: false, rewardAmount: 0 };
        },
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
