
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { LanguageCode } from '@/lib/data';

type AssessmentResult = {
  status: 'unattempted' | 'pass' | 'fail';
  accuracy?: number;
  fluency?: number;
};

export type UserStats = {
  learnedWords: {
    [key in LanguageCode]?: number;
  };
  assessmentResults: {
    [phraseId: string]: AssessmentResult;
  };
  lastSynced?: any; 
};

const STATS_STORAGE_KEY = 'user-stats-cache';

export function useSyncUserStats() {
  const [user] = useAuthState(auth);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isSyncing = useRef(false);
  const hasSyncedFromServer = useRef(false);
  
  console.log("DEBUG: useSyncUserStats hook initialized.");

  // Function to get stats from localStorage
  const getLocalStats = useCallback((): UserStats | null => {
    try {
      const cachedStats = localStorage.getItem(STATS_STORAGE_KEY);
      console.log("DEBUG: Reading from localStorage. Found:", cachedStats ? "data" : "nothing");
      return cachedStats ? JSON.parse(cachedStats) : null;
    } catch (error) {
      console.error("DEBUG: Failed to read from localStorage", error);
      return null;
    }
  }, []);

  // Function to save stats to localStorage
  const saveLocalStats = useCallback((newStats: UserStats) => {
    try {
      console.log("DEBUG: Saving to localStorage:", newStats);
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
    } catch (error) {
      console.error("DEBUG: Failed to write to localStorage", error);
    }
  }, []);

  const syncToServer = useCallback(async (statsToSync: UserStats) => {
    if (!user) {
        console.log("DEBUG: syncToServer skipped, no user.");
        return;
    }
    if (isSyncing.current) {
        console.log("DEBUG: syncToServer skipped, already syncing.");
        return;
    }
    isSyncing.current = true;
    console.log("DEBUG: Syncing to server started for user:", user.uid);
    
    try {
      const statsRef = doc(db, 'user_stats', user.uid);
      await setDoc(statsRef, { ...statsToSync, lastSynced: serverTimestamp() }, { merge: true });
      console.log("DEBUG: Sync to server successful.");
    } catch (error) {
      console.error("DEBUG: Firestore sync failed:", error);
    } finally {
      isSyncing.current = false;
      console.log("DEBUG: Syncing to server finished.");
    }
  }, [user]);

  // Main effect to orchestrate loading and syncing
  useEffect(() => {
    console.log("DEBUG: Main useEffect triggered. User:", user ? user.uid : "null");

    if (!user) {
      // Clear stats if user logs out
      if (stats !== null) {
        console.log("DEBUG: User logged out, clearing stats.");
        setStats(null);
        localStorage.removeItem(STATS_STORAGE_KEY);
      }
      setLoading(false);
      return;
    }

    if (user && !hasSyncedFromServer.current) {
        console.log("DEBUG: User detected, beginning initial load.");
        setLoading(true);

        const initialLoad = async () => {
            // 1. Load from cache immediately for fast UI
            const localStats = getLocalStats();
            if (localStats) {
                console.log("DEBUG: Loaded initial stats from local cache.");
                setStats(localStats);
            }

            // 2. Fetch from Firestore
            const statsRef = doc(db, 'user_stats', user.uid);
            console.log("DEBUG: Attempting to fetch from Firestore. Path:", statsRef.path);

            try {
                const docSnap = await getDoc(statsRef);
                const serverStats = docSnap.exists() ? docSnap.data() as UserStats : null;
                hasSyncedFromServer.current = true;
                console.log("DEBUG: Firestore fetch successful. Server data exists:", docSnap.exists());
                
                // 3. Merge server and local data
                if (serverStats) {
                    const mergedStats = mergeStats(localStats, serverStats);
                    console.log("DEBUG: Merged server and local stats.", {localStats, serverStats, mergedStats});
                    setStats(mergedStats);
                    saveLocalStats(mergedStats);
                } else if (localStats) {
                    console.log("DEBUG: No server data, but local data exists. Pushing local to server.");
                    await syncToServer(localStats);
                } else {
                    console.log("DEBUG: No data anywhere, creating default structure.");
                    const defaultStats = { learnedWords: {}, assessmentResults: {} };
                    setStats(defaultStats);
                    saveLocalStats(defaultStats);
                }
            } catch (error) {
                console.error("DEBUG: Error fetching user stats from Firestore:", error);
                if (!localStats) {
                    console.log("DEBUG: Firestore failed and no local stats, creating default structure.");
                    const defaultStats = { learnedWords: {}, assessmentResults: {} };
                    setStats(defaultStats);
                    saveLocalStats(defaultStats);
                }
            } finally {
                setLoading(false);
                console.log("DEBUG: Initial load process finished.");
            }
        };

        initialLoad();
    }
  }, [user]);

  const mergeStats = (local: UserStats | null, server: UserStats): UserStats => {
    console.log("DEBUG: Merging stats...");
    if (!local) {
        console.log("DEBUG: No local stats, using server stats.");
        return server;
    }
    
    const mergedAssessments = { ...(server.assessmentResults || {}), ...(local.assessmentResults || {}) };
    
    const mergedLearnedWords: { [key in LanguageCode]?: number } = { ...(server.learnedWords || {}) };
    Object.entries(local.learnedWords || {}).forEach(([lang, count]) => {
      mergedLearnedWords[lang as LanguageCode] = Math.max(mergedLearnedWords[lang as LanguageCode] || 0, count || 0);
    });
    
    const final = {
      assessmentResults: mergedAssessments,
      learnedWords: mergedLearnedWords
    };
    console.log("DEBUG: Merge complete.", final);
    return final;
  };

  const updateLearnedPhrase = useCallback((phraseId: string, lang: LanguageCode, result: AssessmentResult) => {
    console.log("DEBUG: updateLearnedPhrase called.", { phraseId, lang, result });
    setStats(currentStats => {
      const newStats = {
        ...currentStats,
        learnedWords: { ... (currentStats?.learnedWords || {}) },
        assessmentResults: { ... (currentStats?.assessmentResults || {}) }
      } as UserStats;

      const wasAlreadyPassed = newStats.assessmentResults[phraseId]?.status === 'pass';
      newStats.assessmentResults[phraseId] = result;

      if (result.status === 'pass' && !wasAlreadyPassed) {
        newStats.learnedWords[lang] = (newStats.learnedWords[lang] || 0) + 1;
      } else if (result.status !== 'pass' && wasAlreadyPassed) {
        newStats.learnedWords[lang] = Math.max(0, (newStats.learnedWords[lang] || 1) - 1);
      }
      
      saveLocalStats(newStats);
      syncToServer(newStats);
      return newStats;
    });
  }, [saveLocalStats, syncToServer]);

  return { stats, loading, updateLearnedPhrase, setStats };
}
