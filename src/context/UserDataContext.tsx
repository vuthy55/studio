

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import type { UserProfile } from '@/app/profile/page';
import { phrasebook, type LanguageCode, offlineAudioPackLanguages } from '@/lib/data';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { debounce } from 'lodash';
import type { PracticeHistoryDoc, PracticeHistoryState, AudioPack } from '@/lib/types';
import type { Timestamp } from 'firebase/firestore';
import { getOfflineAudio } from '@/components/synchub/OfflineManager';
import { getLanguageAudioPack } from '@/actions/audio';
import { openDB } from 'idb';

// --- Types ---

type TransactionLogType = 'practice_earn' | 'translation_spend' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend' | 'language_pack_download';

interface RecordPracticeAttemptArgs {
    phraseId: string;
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
    offlineAudioPacks: Record<string, AudioPack>;
    logout: () => Promise<void>;
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => { wasRewardable: boolean, rewardAmount: number };
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
    spendTokensForTranslation: (description: string, cost?: number) => boolean;
    updateSyncLiveUsage: (durationMs: number) => number;
    handleSyncOnlineSessionEnd: (durationMs: number) => Promise<void>;
    loadSingleOfflinePack: (lang: LanguageCode | 'user_saved_phrases') => Promise<void>;
    removeOfflinePack: (lang: LanguageCode | 'user_saved_phrases') => void;
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const METADATA_STORE_NAME = 'AudioPackMetadata';

interface PackMetadata {
  id: string;
  phraseCount?: number;
  size: number;
}


// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    
    // State is now managed internally
    const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({});
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryState>({});
    const [syncLiveUsage, setSyncLiveUsage] = useState(0);
    const [offlineAudioPacks, setOfflineAudioPacks] = useState<Record<string, AudioPack>>({});


    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const isLoggingOut = useRef(false);

    const pendingPracticeSyncs = useRef<Record<string, { phraseData: PracticeHistoryDoc, rewardAmount: number }>>({}).current;
    const pendingTokenSyncs = useRef<Array<{amount: number, actionType: TransactionLogType, description: string, duration?: number }>>([]).current;
    const pendingUsageSync = useRef<{ duration: number }>({ duration: 0 }).current;
    
    const profileUnsubscribe = useRef<() => void | undefined>();
    const historyUnsubscribe = useRef<() => void | undefined>();
    
    // --- Data Fetching & Main Effect ---
    useEffect(() => {
        getAppSettingsAction().then(setSettings);
    }, []);

    const clearLocalState = useCallback(() => {
        if (profileUnsubscribe.current) profileUnsubscribe.current();
        if (historyUnsubscribe.current) historyUnsubscribe.current();
        setUserProfile({});
        setPracticeHistory({});
        setSyncLiveUsage(0);
        setOfflineAudioPacks({});
        setIsDataLoading(true);
    }, []);

    const loadSingleOfflinePack = useCallback(async (lang: LanguageCode | 'user_saved_phrases') => {
        const pack = await getOfflineAudio(lang);
        if (pack) {
            setOfflineAudioPacks(prev => ({ ...prev, [lang]: pack }));
        }
    }, []);

     useEffect(() => {
        if (authLoading) {
            return;
        }

        if (user) {
            isLoggingOut.current = false;
            setIsDataLoading(true);

            // Fetch all possible offline packs once when user logs in.
            // This ensures all downloaded data is available in memory for offline use.
            const allPackKeys: (LanguageCode | 'user_saved_phrases')[] = [...offlineAudioPackLanguages, 'user_saved_phrases'];
            const packPromises = allPackKeys.map(key => getOfflineAudio(key));
            
            Promise.all(packPromises).then(packs => {
                 const loadedPacks: Record<string, AudioPack> = {};
                 packs.forEach((pack, index) => {
                    if(pack) {
                        const key = allPackKeys[index];
                        loadedPacks[key] = pack;
                    }
                 });
                 setOfflineAudioPacks(loadedPacks);
            });


            // Set up real-time listener for user profile
            const userDocRef = doc(db, 'users', user.uid);
            profileUnsubscribe.current = onSnapshot(userDocRef, async (docSnap) => {
                if (isLoggingOut.current) return;
                if (docSnap.exists()) {
                    const profileData = docSnap.data() as UserProfile;
                    setUserProfile(profileData);
                    setSyncLiveUsage(profileData.syncLiveUsage || 0);

                    // --- Auto-download logic ---
                    if (profileData.unlockedLanguages && profileData.unlockedLanguages.length > 0) {
                        const db = await openDB(DB_NAME, 2);
                        const downloadedPackIds = await db.getAllKeys(STORE_NAME);

                        for (const langCode of profileData.unlockedLanguages) {
                            if (!downloadedPackIds.includes(langCode)) {
                                console.log(`[Auto-Download] User unlocked ${langCode} but it's not offline. Downloading...`);
                                try {
                                    const { audioPack, size } = await getLanguageAudioPack(langCode);
                                    await db.put(STORE_NAME, audioPack, langCode);
                                    const metadata: PackMetadata = { id: langCode, size };
                                    await db.put(METADATA_STORE_NAME, metadata);
                                    loadSingleOfflinePack(langCode);
                                } catch (e) {
                                    console.error(`[Auto-Download] Failed to download pack for ${langCode}:`, e);
                                }
                            }
                        }
                    }
                } else {
                    setUserProfile({});
                }
            }, (error) => {
                console.error("Error listening to user profile:", error);
            });

            // Set up real-time listener for practice history
            const historyCollectionRef = collection(db, 'users', user.uid, 'practiceHistory');
            historyUnsubscribe.current = onSnapshot(historyCollectionRef, (snapshot) => {
                if (isLoggingOut.current) return;
                const historyData: PracticeHistoryState = {};
                snapshot.forEach(doc => {
                    historyData[doc.id] = doc.data();
                });
                setPracticeHistory(historyData);
                setIsDataLoading(false); 
            }, (error) => {
                console.error("Error listening to practice history:", error);
                setIsDataLoading(false);
            });

        } else {
            clearLocalState();
            setIsDataLoading(false);
        }
        
        return () => {
            if (profileUnsubscribe.current) profileUnsubscribe.current();
            if (historyUnsubscribe.current) historyUnsubscribe.current();
        };
    }, [user, authLoading, clearLocalState, loadSingleOfflinePack]);
    

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
                        description: `Reward for mastering phrase` // Generic description
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
        isLoggingOut.current = true;
        debouncedCommitToFirestore.flush(); 
        await auth.signOut();
        clearLocalState();
    }, [debouncedCommitToFirestore, clearLocalState]);


    const updateSyncLiveUsage = useCallback((durationMs: number): number => {
        if (!user || !settings) return 0;
        
        const currentTotalUsage = syncLiveUsage;
        const newTotalUsage = currentTotalUsage + durationMs;
        
        pendingUsageSync.duration += durationMs;
        setSyncLiveUsage(newTotalUsage);

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

    }, [user, settings, syncLiveUsage, userProfile.tokenBalance, pendingTokenSyncs, debouncedCommitToFirestore, pendingUsageSync]);


   const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs): { wasRewardable: boolean, rewardAmount: number } => {
        if (!user || !settings) return { wasRewardable: false, rewardAmount: 0 };
        const { phraseId, lang, isPass, accuracy } = args;

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
                
                // Optimistic UI update
                setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) + rewardAmount }));
            }
        } else {
             updatedPhraseHistory.failCountPerLang![lang] = (updatedPhraseHistory.failCountPerLang![lang] || 0) + 1;
        }
        
        updatedPhraseHistory.lastAccuracyPerLang![lang] = accuracy;
        
        // Optimistic UI update
        const updatedHistory = { ...practiceHistory, [phraseId]: updatedPhraseHistory };
        setPracticeHistory(updatedHistory);

        pendingPracticeSyncs[phraseId] = { phraseData: updatedPhraseHistory, rewardAmount };
        debouncedCommitToFirestore();
        
        return { wasRewardable, rewardAmount };

    }, [user, settings, practiceHistory, debouncedCommitToFirestore, pendingPracticeSyncs]);
    
    const spendTokensForTranslation = useCallback((description: string, cost?: number): boolean => {
        if (!user || !settings) return false;

        const currentBalance = userProfile.tokenBalance || 0;
        const transactionCost = cost !== undefined ? cost : (settings.translationCost || 1);

        if (currentBalance < transactionCost) {
            return false;
        }
        
        // Optimistic UI update
        setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) - transactionCost }));
        
        pendingTokenSyncs.push({
            amount: transactionCost,
            actionType: cost !== undefined ? 'language_pack_download' : 'translation_spend',
            description
        });
        debouncedCommitToFirestore();

        return true;
    }, [user, settings, userProfile, pendingTokenSyncs, debouncedCommitToFirestore]);


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
        
        // It's better to read from state here if possible, but reading from server is safer
        const userDocSnap = await getDoc(userDocRef);
        const currentProfile = userDocSnap.data() as UserProfile | undefined;
        if (!currentProfile) return;

        let { syncOnlineUsage = 0, syncOnlineUsageLastReset, tokenBalance = 0 } = currentProfile;
        
        const now = new Date();
        const lastReset = syncOnlineUsageLastReset?.toDate() ?? new Date(0);

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
            cost = tokenBalance;
        }
        
        const batch = writeBatch(db);

        const updatePayload: Record<string, any> = {
            syncOnlineUsage: increment(durationMs)
        };
        if (syncOnlineUsage === 0) {
            updatePayload.syncOnlineUsageLastReset = syncOnlineUsageLastReset;
        }

        if (cost > 0) {
            updatePayload.tokenBalance = increment(-cost);
        }

        batch.update(userDocRef, updatePayload);

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
        } catch (error) {
            console.error("Error committing Sync Online session end transaction:", error);
        }
    }, [user, settings]);

    const removeOfflinePack = useCallback((lang: LanguageCode | 'user_saved_phrases') => {
        setOfflineAudioPacks(prev => {
            const newState = { ...prev };
            delete newState[lang];
            return newState;
        });
    }, []);

    const value = {
        user,
        loading: authLoading || isDataLoading,
        userProfile,
        practiceHistory,
        settings,
        syncLiveUsage,
        offlineAudioPacks,
        logout,
        recordPracticeAttempt,
        getTopicStats,
        spendTokensForTranslation,
        updateSyncLiveUsage,
        handleSyncOnlineSessionEnd,
        loadSingleOfflinePack,
        removeOfflinePack
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
