
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, increment, onSnapshot, updateDoc, arrayUnion, arrayRemove, Timestamp, query, orderBy } from 'firebase/firestore';
import type { UserProfile, SavedPhrase } from '@/lib/types';
import { phrasebook, type LanguageCode, offlineAudioPackLanguages } from '@/lib/data';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { debounce } from 'lodash';
import type { PracticeHistoryDoc, PracticeHistoryState, AudioPack } from '@/lib/types';
import { initializeAndLoadOfflinePacks, removeOfflinePack as removePackFromDB, loadSingleOfflinePack as loadPackToDB } from '@/services/offline';
import { downloadLanguagePack, getSavedPhrasesAudioPack } from '@/actions/audio';
import { openDB } from 'idb';
import type { User } from 'firebase/auth';


// --- Types ---

type TransactionLogType = 'practice_earn' | 'translation_spend' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend' | 'language_pack_download' | 'infohub_intel' | 'save_phrase_spend' | 'transcript_generation';

interface RecordPracticeAttemptArgs {
    phraseId: string;
    topicId: string;
    lang: LanguageCode;
    isPass: boolean;
    accuracy: number;
}

interface UserDataContextType {
    user: User | null | undefined;
    loading: boolean;
    userProfile: Partial<UserProfile>;
    practiceHistory: PracticeHistoryState;
    savedPhrases: SavedPhrase[];
    settings: AppSettings | null;
    syncLiveUsage: number;
    offlineAudioPacks: Record<string, AudioPack>;
    logout: () => Promise<void>;
    recordPracticeAttempt: (args: RecordPracticeAttemptArgs) => { wasRewardable: boolean, rewardAmount: number };
    getTopicStats: (topicId: string, lang: LanguageCode) => { correct: number; tokensEarned: number };
    spendTokensForTranslation: (description: string, cost?: number) => boolean;
    updateSyncLiveUsage: (durationMs: number, usageType: 'live' | 'online') => number;
    loadSingleOfflinePack: (lang: LanguageCode) => Promise<void>;
    removeOfflinePack: (lang: LanguageCode | 'user_saved_phrases') => Promise<void>;
    resyncSavedPhrasesAudio: () => Promise<void>;
}

// --- Context ---

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

// --- Provider ---

export const UserDataProvider = ({ children }: { children: ReactNode }) => {
    const [user, authLoading] = useAuthState(auth);
    
    // State is now managed internally
    const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({});
    const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryState>({});
    const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);
    const [syncLiveUsage, setSyncLiveUsage] = useState(0);
    const [offlineAudioPacks, setOfflineAudioPacks] = useState<Record<string, AudioPack>>({});


    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const isLoggingOut = useRef(false);

    const pendingPracticeSyncs = useRef<Record<string, { phraseData: PracticeHistoryDoc, rewardAmount: number }>>({}).current;
    const pendingTokenSyncs = useRef<Array<{amount: number, actionType: TransactionLogType, description: string, duration?: number }>>([]).current;
    const pendingUsageSync = useRef<{ live: number; online: number }>({ live: 0, online: 0 }).current;
    
    const profileUnsubscribe = useRef<() => void | undefined>();
    const historyUnsubscribe = useRef<() => void | undefined>();
    const savedPhrasesUnsubscribe = useRef<() => void | undefined>();
    
    // --- Data Fetching & Main Effect ---
    useEffect(() => {
        getAppSettingsAction().then(setSettings);
    }, []);
    
    const loadSingleOfflinePack = useCallback(async (lang: LanguageCode) => {
        const { audioPack, size } = await downloadLanguagePack(lang);
        await loadPackToDB(lang, audioPack, size);
        setOfflineAudioPacks(prev => ({ ...prev, [lang]: audioPack }));
    }, []);
    
     const removeOfflinePack = useCallback(async (lang: LanguageCode | 'user_saved_phrases') => {
        await removePackFromDB(lang);
        setOfflineAudioPacks(prev => {
            const newState = { ...prev };
            delete newState[lang];
            return newState;
        });
    }, []);
    
    const resyncSavedPhrasesAudio = useCallback(async () => {
        if (!user) return;
        const { audioPack, size } = await getSavedPhrasesAudioPack(user.uid);
        await loadPackToDB('user_saved_phrases', audioPack, size);
        setOfflineAudioPacks(prev => ({ ...prev, user_saved_phrases: { ...audioPack } }));
    }, [user]);

    const clearLocalState = useCallback(() => {
        if (profileUnsubscribe.current) profileUnsubscribe.current();
        if (historyUnsubscribe.current) historyUnsubscribe.current();
        if (savedPhrasesUnsubscribe.current) savedPhrasesUnsubscribe.current();
        setUserProfile({});
        setPracticeHistory({});
        setSavedPhrases([]);
        setSyncLiveUsage(0);
        setOfflineAudioPacks({});
        setIsDataLoading(true);
    }, []);

    useEffect(() => {
        if (authLoading) {
            return;
        }

        if (user) {
            isLoggingOut.current = false;
            setIsDataLoading(true);

            // --- Load existing offline packs from IndexedDB into state ---
            const loadOfflinePacks = async () => {
                try {
                    const loadedPacks = await initializeAndLoadOfflinePacks();
                    setOfflineAudioPacks(loadedPacks);
                } catch(error) {
                    console.error("Critical error loading offline audio packs from IndexedDB:", error);
                }
            };
            

            const userDocRef = doc(db, 'users', user.uid);
            
            // --- Listen for profile changes ---
            profileUnsubscribe.current = onSnapshot(userDocRef, (docSnap) => {
                if (isLoggingOut.current) return;

                if (docSnap.exists()) {
                    const profileData = docSnap.data() as UserProfile;
                    setUserProfile(profileData);
                    setSyncLiveUsage(profileData.syncLiveUsage || 0);
                    // Now that profile is loaded, load offline packs
                    loadOfflinePacks();
                } else {
                    setUserProfile({});
                }
            }, (error) => {
                console.error("Error listening to user profile:", error);
            });

            // --- Listen for practice history changes ---
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

             // --- Listen for saved phrases changes ---
             const savedPhrasesRef = collection(db, 'users', user.uid, 'savedPhrases');
             const savedPhrasesQuery = query(savedPhrasesRef, orderBy('createdAt', 'desc'));
             savedPhrasesUnsubscribe.current = onSnapshot(savedPhrasesQuery, (snapshot) => {
                if (isLoggingOut.current) return;
                const serverPhrases = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SavedPhrase));
                setSavedPhrases(serverPhrases);
             }, (error) => {
                console.error("Error listening to saved phrases:", error);
             });


        } else {
            clearLocalState();
            setIsDataLoading(false);
        }
        
        return () => {
            if (profileUnsubscribe.current) profileUnsubscribe.current();
            if (historyUnsubscribe.current) historyUnsubscribe.current();
            if (savedPhrasesUnsubscribe.current) savedPhrasesUnsubscribe.current();
        };
    }, [user, authLoading, clearLocalState]);
    

    // --- Firestore Synchronization Logic ---
    const debouncedCommitToFirestore = useRef(
        debounce(async () => {
            if (isLoggingOut.current) return;
            const userUid = auth.currentUser?.uid;
            if (!userUid) return;

            const practiceSyncs = { ...pendingPracticeSyncs };
            const tokenSyncs = [...pendingTokenSyncs];
            const usageToSync = { ...pendingUsageSync };

            Object.keys(pendingPracticeSyncs).forEach(key => delete pendingPracticeSyncs[key]);
            pendingTokenSyncs.length = 0;
            pendingUsageSync.live = 0;
            pendingUsageSync.online = 0;
            
            if (Object.keys(practiceSyncs).length === 0 && tokenSyncs.length === 0 && usageToSync.live === 0 && usageToSync.online === 0) {
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
            if (usageToSync.live > 0) {
                 updatePayload.syncLiveUsage = increment(usageToSync.live);
            }
             if (usageToSync.online > 0) {
                 updatePayload.syncOnlineUsage = increment(usageToSync.online);
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


    const updateSyncLiveUsage = useCallback((durationMs: number, usageType: 'live' | 'online'): number => {
        if (!user || !settings) return 0;
        
        const isLive = usageType === 'live';
        const currentTotalUsage = isLive ? (userProfile.syncLiveUsage || 0) : (userProfile.syncOnlineUsage || 0);
        const freeMinutesMs = isLive ? (settings.freeSyncLiveMinutes || 0) * 60 * 1000 : (settings.freeSyncOnlineMinutes || 0) * 60 * 1000;
        const costPerMinute = isLive ? (settings.costPerSyncLiveMinute || 1) : (settings.costPerSyncOnlineMinute || 1);
        
        const newTotalUsage = currentTotalUsage + durationMs;
        
        if (isLive) {
            pendingUsageSync.live += durationMs;
            setUserProfile(p => ({ ...p, syncLiveUsage: newTotalUsage }));
        } else {
            pendingUsageSync.online += durationMs;
            setUserProfile(p => ({ ...p, syncOnlineUsage: newTotalUsage }));
        }

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
                     actionType: isLive ? 'live_sync_spend' : 'live_sync_online_spend',
                     description: `Usage charge for ${minutesToCharge} minute(s) of ${isLive ? 'Sync Live' : 'Sync Online'}.`,
                     duration: durationMs
                 });
             }
        }
        
        debouncedCommitToFirestore();
        return tokensSpentThisTurn;

    }, [user, settings, userProfile, pendingTokenSyncs, debouncedCommitToFirestore, pendingUsageSync]);


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
        let transactionCost;
        let actionType: TransactionLogType = 'translation_spend';
        
        if (description.includes("Saved phrase")) {
            actionType = 'save_phrase_spend';
            const downloadedCount = userProfile.downloadedPhraseCount || 0;
            if (downloadedCount < (settings.freeSavedPhrasesLimit || 100)) {
                 transactionCost = 0; // Free for the first N phrases
            } else {
                transactionCost = settings.liveTranslationSavePhraseCost || 1;
            }
        } else if (cost !== undefined) {
             transactionCost = cost;
             if (description.includes("language pack")) {
                actionType = 'language_pack_download';
             } else if (description.includes("travel intel")) {
                actionType = 'infohub_intel';
             }
        } else {
            transactionCost = settings.translationCost || 1;
        }

        if (currentBalance < transactionCost) {
            return false;
        }
        
        // Optimistic UI update
        if (transactionCost > 0) {
            setUserProfile(p => ({...p, tokenBalance: (p.tokenBalance || 0) - transactionCost }));
            pendingTokenSyncs.push({
                amount: transactionCost,
                actionType: actionType,
                description
            });
            debouncedCommitToFirestore();
        }

        if (actionType === 'save_phrase_spend') {
            const userRef = doc(db, 'users', user.uid);
            updateDoc(userRef, { downloadedPhraseCount: increment(1) });
            setUserProfile(p => ({...p, downloadedPhraseCount: (p.downloadedPhraseCount || 0) + 1 }));
        }

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

    const value: UserDataContextType = {
        user,
        loading: authLoading || isDataLoading,
        userProfile,
        practiceHistory,
        savedPhrases,
        settings,
        syncLiveUsage,
        offlineAudioPacks,
        logout,
        recordPracticeAttempt,
        getTopicStats,
        spendTokensForTranslation,
        updateSyncLiveUsage,
        loadSingleOfflinePack,
        removeOfflinePack,
        resyncSavedPhrasesAudio
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
