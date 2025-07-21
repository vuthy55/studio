
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
                setLoading(authLoading);
            }
        };

        fetchData();
    }, [user, authLoading]);

    // --- Client-Side Actions ---

    // This is the core of the fix. We are separating the instant UI update
    // from the background sync to prevent re-renders.
    const syncToFirestore = useCallback(async (
        profileUpdate: Partial<UserProfile>,
        historyUpdate: PracticeHistoryState
    ) => {
        if (!user) return;

        console.log("[DEBUG] Background Sync: Starting sync to Firestore", { profileUpdate, historyUpdate });
        const batch = writeBatch(db);
        
        // Sync Profile and Stats
        if (Object.keys(profileUpdate).length > 0) {
            const userDocRef = doc(db, 'users', user.uid);
            batch.set(userDocRef, profileUpdate, { merge: true });
        }

        // Sync Practice History
        for (const phraseId in historyUpdate) {
            const historyDocRef = doc(db, 'users', user.uid, 'practiceHistory', phraseId);
            batch.set(historyDocRef, historyUpdate[phraseId], { merge: true });
        }

        try {
            await batch.commit();
            console.log("[DEBUG] Background Sync: Sync successful.");
        } catch (error) {
            console.error("Error syncing data to Firestore:", error);
        }
    }, [user]);

    // Debounce the sync function to bundle multiple quick updates into one.
    const debouncedSync = useCallback(debounce(syncToFirestore, 5000), [syncToFirestore]);


    const recordPracticeAttempt = useCallback((args: RecordPracticeAttemptArgs) => {
        if (!settings) return; // Guard against calls before settings are loaded
        const { phraseId, phraseText, topicId, lang, isPass, accuracy, settings: passedSettings } = args;
        
        // This function will now ONLY update the local state for immediate UI feedback.
        // It will then queue the changes to be synced to Firestore in the background.

        let tokenChange = 0;
        
        // --- 1. Update Practice History State ---
        setPracticeHistory(currentHistory => {
            const updatedHistory = { ...currentHistory };
            const phraseHistory = updatedHistory[phraseId] || { passCountPerLang: {}, failCountPerLang: {} };

            if (isPass) {
                phraseHistory.passCountPerLang = { ...phraseHistory.passCountPerLang, [lang]: (phraseHistory.passCountPerLang?.[lang] || 0) + 1 };
                 if ( (phraseHistory.passCountPerLang[lang]! > 0) && (phraseHistory.passCountPerLang[lang]! % passedSettings.practiceThreshold === 0) ) {
                    tokenChange = passedSettings.practiceReward;
                }
            } else {
                phraseHistory.failCountPerLang = { ...phraseHistory.failCountPerLang, [lang]: (phraseHistory.failCountPerLang?.[lang] || 0) + 1 };
            }

            phraseHistory.lastAccuracyPerLang = { ...phraseHistory.lastAccuracyPerLang, [lang]: accuracy };
            phraseHistory.phraseText = phraseText;
            updatedHistory[phraseId] = phraseHistory;
            
             // Queue this specific history change for sync
            const historyUpdateForSync = {
                [phraseId]: {
                    ...phraseHistory,
                    lastAttemptPerLang: { 
                        ...(phraseHistory.lastAttemptPerLang || {}),
                        [lang]: serverTimestamp()
                    }
                }
            };

            // This is a snapshot of the profile to be updated in the background
            const profileUpdateForSync: Partial<UserProfile> = {};
            if (tokenChange > 0) {
                 profileUpdateForSync.tokenBalance = increment(tokenChange);
            }
             
            debouncedSync(profileUpdateForSync, historyUpdateForSync);

            return updatedHistory;
        });

        // --- 2. Update Profile State (if tokens were earned) ---
        if (tokenChange > 0) {
            setUserProfile(currentProfile => {
                 const updatedProfile = {...currentProfile};
                 updatedProfile.tokenBalance = (updatedProfile.tokenBalance || 0) + tokenChange;
                 
                 // Update stats locally for instant feedback
                 if (!updatedProfile.practiceStats) updatedProfile.practiceStats = { byLanguage: {}, byTopic: {} };
                 if (!updatedProfile.practiceStats.byTopic) updatedProfile.practiceStats.byTopic = {};
                 if (!updatedProfile.practiceStats.byTopic[topicId]) updatedProfile.practiceStats.byTopic[topicId] = {};
                 if (!updatedProfile.practiceStats.byTopic[topicId][lang]) updatedProfile.practiceStats.byTopic[topicId][lang] = { correct: 0, tokensEarned: 0 };
                 updatedProfile.practiceStats.byTopic[topicId][lang].tokensEarned += tokenChange;

                 return updatedProfile;
            });
        }
        
    }, [debouncedSync, settings]);


    const getTopicStats = useCallback((topicId: string, lang: LanguageCode) => {
        // This needs to be calculated on the fly from the practiceHistory state
        // to be accurate without causing re-renders from stats objects.
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
