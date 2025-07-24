

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
import type { UserProfile } from '@/app/profile/page';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { debounce } from 'lodash';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PracticeHistoryDoc, PracticeHistoryState } from '@/lib/types';

// --- Types ---

type TransactionLogType = 'practice_earn' | 'translation_spend' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend';

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
    logout: () => Promise<void>;
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => { wasRewardable: boolean, rewardAmount: number };
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
    spendTokensForTranslation: (description: string) => boolean;
    updateSyncLiveUsage: (durationMs: number) => number;
    handleSyncOnlineSessionEnd: (durationMs: number) => Promise<void>;
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
    const [hasFetched, setHasFetched] = useState(false); // New state to prevent re-fetching
    const isLoggingOut = useRef(false);

    const pendingPracticeSyncs = useRef<Record<string, { phraseData: PracticeHistoryDoc, rewardAmount: number }>>({}).current;
    const pendingTokenSyncs = useRef<Array<{amount: number, actionType: TransactionLogType, description: string, duration?: number }>>([]).current;
    const pendingUsageSync = useRef<{ duration: number }>({ duration: 0 }).current;
    
    // --- Data Fetching & Main Effect ---
    useEffect(() => {
        getAppSettingsAction().then(setSettings);
    }, []);

    const fetchUserProfile = useCallback(async () => {
        if (!auth.currentUser || isLoggingOut.current) return;
        
        try {
            console.log("[DEBUG] UserDataContext: fetchUserProfile running for user:", auth.currentUser.uid);
            const userDocRef = doc(db, 'users', auth.currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const profileData = userDocSnap.data() as UserProfile;
                setUserProfile(profileData);
                setSyncLiveUsage(profileData.syncLiveUsage || 0);
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
        }
    }, [setUserProfile]);

     useEffect(() => {
        const fetchAllData = async () => {
            if (!user || isLoggingOut.current) return;
            console.log("[DEBUG] UserDataContext: User detected, fetching data.");
            
            await fetchUserProfile();

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
            
            setHasFetched(true); // Mark initial fetch as complete
            setLoading(false);
        };

        if (user && !authLoading && !hasFetched) {
            fetchAllData();
        } else if (!user && !authLoading) {
            if (hasFetched) { // Reset only if we had previously fetched data
                 console.log("[DEBUG] UserDataContext: No user detected, clearing local state.");
                 setUserProfile({});
                 setPracticeHistory({});
                 setSyncLiveUsage(0);
                 setHasFetched(false); // Reset for the next login
            }
            setLoading(false);
        }
    }, [user, authLoading, hasFetched, fetchUserProfile, setPracticeHistory, setUserProfile]);


    // --- Firestore Synchronization Logic ---
    const debouncedCommitToFirestore = useRef(
        debounce(async () => {
            if (isLoggingOut.current) return;
            const userUid = auth.currentUser?.uid;
            if (!userUid) return;

            const practiceSyncs = { ...pendingPracticeSyncs };
            const tokenSyncs = [...pendingTokenSyncs];
            const usageToSync = pendingUsageSync.duration;

            Object.keys(pendingPracticeSyncs).forEach(key => delete pendingPracticeSyncs[key]);
            pendingTokenSyncs.length = 0;
            pendingUsageSync.duration = 0;
            
            if (Object.keys(practiceSyncs).length === 0 && tokenSyncs.length === 0 && usageToSync === 0) {
                return;
            }

            const batch = writeBatch(db);
            let totalTokenChange = 0;

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
            if (usageToSync > 0) {
                 updatePayload.syncLiveUsage = increment(usageToSync);
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

    const logout = useCallback(async () => {
        console.log("[DEBUG] UserDataContext: Logout initiated.");
        isLoggingOut.current = true;
        debouncedCommitToFirestore.flush(); 
        
        await auth.signOut();
        
        // Explicitly clear local state and localStorage
        setUserProfile({});
        setPracticeHistory({});
        setSyncLiveUsage(0);
        setHasFetched(false); // Reset for next login
        
        isLoggingOut.current = false;
        console.log("[DEBUG] UserDataContext: Logout complete and local state cleared.");
    }, [debouncedCommitToFirestore, setUserProfile, setPracticeHistory]);

    const updateSyncLiveUsage = useCallback((durationMs: number): number => {
        if (!user || !settings) return 0;
        
        const currentTotalUsage = syncLiveUsage;
        const newTotalUsage = currentTotalUsage + durationMs;
        
        pendingUsageSync.duration += durationMs;
        setSyncLiveUsage(newTotalUsage); // Optimistically update local state for immediate UI feedback

        const freeMinutesMs = (settings.freeSyncLiveMinutes || 0) * 60 * 1000;
        const costPerMinute = settings.costPerSyncLiveMinute || 1;

        const prevBilledMinutes = Math.ceil(Math.max(0, currentTotalUsage - freeMinutesMs) / (60 * 1000));
        const currentBilledMinutes = Math.ceil(Math.max(0, newTotalUsage - freeMinutesMs) / (60 * 1000));
        
        const minutesToCharge = currentBilledMinutes - prevBilledMinutes;
        let tokensSpentThisTurn = 0;
        
        if (minutesToCharge > 0) {
            const cost = minutesToCharge * costPerMinute;
            tokensSpentThisTurn = cost;
             const currentBalance = userProfile.tokenBalance || 0;
             if (currentBalance >= cost) {
                 setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) - cost }));
                 pendingTokenSyncs.push({
                     amount: cost,
                     actionType: 'live_sync_spend',
                     description: `Usage charge for ${minutesToCharge} minute(s) of Live Sync.`,
                     duration: durationMs
                 });
             }
        }
        
        debouncedCommitToFirestore();
        return tokensSpentThisTurn;

    }, [user, settings, syncLiveUsage, userProfile.tokenBalance, setUserProfile, pendingTokenSyncs, debouncedCommitToFirestore, pendingUsageSync]);


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

    const handleSyncOnlineSessionEnd = useCallback(async (durationMs: number) => {
        if (!user || !settings) return;

        const userDocRef = doc(db, 'users', user.uid);
        
        // Fetch the latest user profile to ensure data is current
        const userDocSnap = await getDoc(userDocRef);
        const currentProfile = userDocSnap.data() as UserProfile | undefined;
        if (!currentProfile) return;

        let { syncOnlineUsage = 0, syncOnlineUsageLastReset, tokenBalance = 0 } = currentProfile;
        
        const now = new Date();
        const lastReset = syncOnlineUsageLastReset?.toDate() ?? new Date(0); // If never reset, use epoch

        // Reset usage if it's a new month
        if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
            syncOnlineUsage = 0;
            syncOnlineUsageLastReset = Timestamp.fromDate(now);
        }

        const freeMs = (settings.freeSyncOnlineMinutes || 0) * 60 * 1000;
        const billableMs = Math.max(0, durationMs - Math.max(0, freeMs - syncOnlineUsage));
        
        let cost = 0;
        if (billableMs > 0) {
            const minutesToBill = Math.ceil(billableMs / 60000);
            cost = minutesToBill * (settings.costPerSyncOnlineMinute || 1);
        }

        if (cost > tokenBalance) {
            cost = tokenBalance; // Don't charge more than they have
        }
        
        const batch = writeBatch(db);

        // Update payload for Firestore
        const updatePayload: Record<string, any> = {
            syncOnlineUsage: increment(durationMs)
        };
        // Only set the reset date if it's a new month
        if (syncOnlineUsage === 0) {
            updatePayload.syncOnlineUsageLastReset = syncOnlineUsageLastReset;
        }

        if (cost > 0) {
            updatePayload.tokenBalance = increment(-cost);
        }

        batch.update(userDocRef, updatePayload);

        // Add transaction log if a cost was incurred
        if (cost > 0) {
            const logRef = doc(collection(userDocRef, 'transactionLogs'));
            batch.set(logRef, {
                actionType: 'live_sync_online_spend',
                tokenChange: -cost,
                timestamp: serverTimestamp(),
                description: `Usage charge for ${Math.ceil(billableMs / 60000)} minute(s) of Sync Online.`,
                duration: durationMs
            });
        }
        
        try {
            await batch.commit();
            // Optimistically update local state after successful commit
            setUserProfile(p => ({
                ...p,
                tokenBalance: (p.tokenBalance || 0) - cost,
                syncOnlineUsage: (p.syncOnlineUsage || 0) + durationMs,
                syncOnlineUsageLastReset: syncOnlineUsageLastReset
            }));
        } catch (error) {
            console.error("Error committing Sync Online session end transaction:", error);
        }
    }, [user, settings, setUserProfile]);


    const value = {
        user,
        loading: loading || authLoading,
        userProfile,
        practiceHistory,
        settings,
        syncLiveUsage,
        fetchUserProfile,
        logout,
        recordPracticeAttempt,
        getTopicStats,
        spendTokensForTranslation,
        updateSyncLiveUsage,
        handleSyncOnlineSessionEnd,
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
