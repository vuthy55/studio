
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

type TransactionLogType = 'practice_earn' | 'translation_spend' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend';

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
    syncLiveUsage: number;
    fetchUserProfile: () => Promise<void>;
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => { wasRewardable: boolean, rewardAmount: number };
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
    spendTokensForTranslation: (description: string) => boolean;
    updateSyncLiveUsage: (durationMs: number) => void;
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    
    const [userProfile, setUserProfile] = useLocalStorage<Partial<UserProfile>>('userProfile', {});
    const [practiceHistory, setPracticeHistory] = useLocalStorage<PracticeHistoryState>('practiceHistory', {});
    const [syncLiveUsage, setSyncLiveUsage] = useState(0);

    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const pendingPracticeSyncs = useRef<Record<string, { phraseData: PracticeHistoryDoc, rewardAmount: number }>>({}).current;
    const pendingTokenSyncs = useRef<Array<{amount: number, actionType: TransactionLogType, description: string, duration?: number }>>([]).current;
    
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
                const profileData = userDocSnap.data() as UserProfile;
                setUserProfile(profileData);
                setSyncLiveUsage(profileData.syncLiveUsage || 0); // Load persistent usage
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
                if (Object.keys(practiceHistory).length === 0) {
                    await fetchPracticeHistory();
                }
                setLoading(false);
            } else if (!user && !authLoading) {
                setUserProfile({});
                setPracticeHistory({});
                setSyncLiveUsage(0);
                setLoading(false);
            }
        }
        fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading]);


    // --- Firestore Synchronization Logic ---
    const debouncedCommitToFirestore = useRef(
        debounce(async () => {
            const userUid = auth.currentUser?.uid;
            if (!userUid) return;

            const practiceSyncs = { ...pendingPracticeSyncs };
            const tokenSyncs = [...pendingTokenSyncs];

            Object.keys(pendingPracticeSyncs).forEach(key => delete pendingPracticeSyncs[key]);
            pendingTokenSyncs.length = 0;

            if (Object.keys(practiceSyncs).length === 0 && tokenSyncs.length === 0) {
                return;
            }

            const batch = writeBatch(db);
            let totalTokenChange = 0;
            let totalUsageUpdate = 0;

            for (const phraseId in practiceSyncs) {
                const { phraseData, rewardAmount } = practiceSyncs[phraseId];
                const historyDocRef = doc(db, 'users', userUid, 'practiceHistory', phraseId);
                batch.set(historyDocRef, phraseData, { merge: true });
                totalTokenChange += rewardAmount;

                 if (rewardAmount > 0) {
                    const logRef = doc(collection(db, `users/${userUid}/transactionLogs`));
                    batch.set(logRef, {
                        actionType: 'practice_earn',
                        tokenChange: rewardAmount,
                        timestamp: serverTimestamp(),
                        description: `Reward for mastering: "${phraseData.phraseText?.substring(0, 50)}..."`
                    });
                }
            }
            
            for (const tokenTx of tokenSyncs) {
                totalTokenChange -= tokenTx.amount;
                totalUsageUpdate += tokenTx.actionType === 'live_sync_spend' ? (tokenTx.duration || 0) : 0;
                
                const logRef = doc(collection(db, `users/${userUid}/transactionLogs`));
                const logData: any = {
                    actionType: tokenTx.actionType,
                    tokenChange: -tokenTx.amount,
                    timestamp: serverTimestamp(),
                    description: tokenTx.description,
                };
                if(tokenTx.duration) logData.duration = tokenTx.duration;
                 batch.set(logRef, logData);
            }

            const userDocRef = doc(db, 'users', userUid);
            const updatePayload: Record<string, any> = {};
            if (totalTokenChange !== 0) {
                updatePayload.tokenBalance = increment(totalTokenChange);
            }
            if (totalUsageUpdate > 0) {
                 updatePayload.syncLiveUsage = increment(totalUsageUpdate);
            }
            
            if (Object.keys(updatePayload).length > 0) {
                batch.update(userDocRef, updatePayload);
            }
            
            try {
                await batch.commit();
            } catch (error) {
                 console.error("Error committing batch to Firestore:", error);
            }
        }, 3000)
    ).current;
    
    // --- Public Actions ---

    const updateSyncLiveUsage = useCallback((durationMs: number) => {
        if (!user || !settings) return;
        
        const newTotalUsage = syncLiveUsage + durationMs;
        setSyncLiveUsage(newTotalUsage);

        const freeMinutesMs = (settings.freeSyncLiveMinutes || 0) * 60 * 1000;
        
        const prevBilledMinutes = Math.ceil(Math.max(0, syncLiveUsage - freeMinutesMs) / (60 * 1000));
        const currentBilledMinutes = Math.ceil(Math.max(0, newTotalUsage - freeMinutesMs) / (60 * 1000));
        
        const minutesToCharge = currentBilledMinutes - prevBilledMinutes;
        
        if (minutesToCharge > 0) {
            const cost = minutesToCharge * (settings.costPerSyncLiveMinute || 1);
             const currentBalance = userProfile.tokenBalance || 0;
             if (currentBalance >= cost) {
                 setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) - cost }));
                 pendingTokenSyncs.push({
                     amount: cost,
                     actionType: 'live_sync_spend',
                     description: `Usage charge for ${minutesToCharge} minute(s).`,
                     duration: durationMs
                 });
                 debouncedCommitToFirestore();
             }
        } else {
             // If no charge, still sync usage periodically.
             pendingTokenSyncs.push({ amount: 0, actionType: 'live_sync_spend', description: 'Usage tracking', duration: durationMs });
             debouncedCommitToFirestore();
        }

    }, [user, settings, syncLiveUsage, userProfile.tokenBalance, setUserProfile, pendingTokenSyncs, debouncedCommitToFirestore]);


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

            if (previousPassCount < settings.practiceThreshold && newPassCount >= settings.practiceThreshold) {
                wasRewardable = true;
                rewardAmount = settings.practiceReward;
                
                setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) + rewardAmount }));
            }
        } else {
             updatedPhraseHistory.failCountPerLang![lang] = (updatedPhraseHistory.failCountPerLang![lang] || 0) + 1;
        }
        
        updatedPhraseHistory.lastAccuracyPerLang![lang] = accuracy;
        updatedPhraseHistory.phraseText = phraseText;

        const updatedHistory = { ...practiceHistory, [phraseId]: updatedPhraseHistory };
        setPracticeHistory(updatedHistory);

        pendingPracticeSyncs[phraseId] = { phraseData: updatedPhraseHistory, rewardAmount };
        debouncedCommitToFirestore();
        
        return { wasRewardable, rewardAmount };

    }, [user, settings, practiceHistory, setPracticeHistory, setUserProfile, debouncedCommitToFirestore, pendingPracticeSyncs]);
    
    const spendTokensForTranslation = useCallback((description: string): boolean => {
        if (!user || !settings) return false;

        const currentBalance = userProfile.tokenBalance || 0;
        const cost = settings.translationCost || 1;

        if (currentBalance < cost) {
            return false;
        }

        setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) - cost }));
        
        pendingTokenSyncs.push({ amount: cost, actionType: 'translation_spend', description });
        debouncedCommitToFirestore();

        return true;
    }, [user, settings, userProfile, setUserProfile, pendingTokenSyncs, debouncedCommitToFirestore]);


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
        syncLiveUsage,
        fetchUserProfile,
        recordPracticeAttempt,
        getTopicStats,
        spendTokensForTranslation,
        updateSyncLiveUsage,
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
