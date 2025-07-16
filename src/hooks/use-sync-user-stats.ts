
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

  // Function to get stats from localStorage
  const getLocalStats = useCallback((): UserStats | null => {
    try {
      const cachedStats = localStorage.getItem(STATS_STORAGE_KEY);
      return cachedStats ? JSON.parse(cachedStats) : null;
    } catch (error) {
      console.error("Failed to read from localStorage", error);
      return null;
    }
  }, []);

  // Function to save stats to localStorage
  const saveLocalStats = useCallback((newStats: UserStats) => {
    try {
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
    } catch (error) {
      console.error("Failed to write to localStorage", error);
    }
  }, []);

  const syncToServer = useCallback(async (statsToSync: UserStats) => {
    if (!user || isSyncing.current) return;
    isSyncing.current = true;
    
    try {
      const statsRef = doc(db, 'user_stats', user.uid);
      await setDoc(statsRef, { ...statsToSync, lastSynced: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error("Firestore sync failed:", error);
    } finally {
      isSyncing.current = false;
    }
  }, [user]);

  // Main effect to orchestrate loading and syncing
  useEffect(() => {
    if (!user) {
      // Clear stats if user logs out
      if (stats !== null) {
        setStats(null);
        localStorage.removeItem(STATS_STORAGE_KEY);
      }
      setLoading(false);
      return;
    }

    if (user && !stats && !hasSyncedFromServer.current) {
        setLoading(true);

        const initialLoad = async () => {
            // 1. Load from cache immediately for fast UI
            const localStats = getLocalStats();
            if (localStats) {
                setStats(localStats);
            }

            // 2. Fetch from Firestore
            const statsRef = doc(db, 'user_stats', user.uid);
            try {
                const docSnap = await getDoc(statsRef);
                const serverStats = docSnap.exists() ? docSnap.data() as UserStats : null;
                hasSyncedFromServer.current = true;
                
                // 3. Merge server and local data
                if (serverStats) {
                    const mergedStats = mergeStats(localStats, serverStats);
                    setStats(mergedStats);
                    saveLocalStats(mergedStats);
                } else if (localStats) {
                    // No server data, but local data exists. Push local to server.
                    await syncToServer(localStats);
                } else {
                    // No data anywhere, create a default structure
                    const defaultStats = { learnedWords: {}, assessmentResults: {} };
                    setStats(defaultStats);
                    saveLocalStats(defaultStats);
                }
            } catch (error) {
                console.error("Error fetching user stats from Firestore:", error);
                // If firestore fails, we rely on local stats
                 if (!localStats) {
                    const defaultStats = { learnedWords: {}, assessmentResults: {} };
                    setStats(defaultStats);
                    saveLocalStats(defaultStats);
                 }
            } finally {
                setLoading(false);
            }
        };

        initialLoad();
    }
  }, [user, stats, getLocalStats, saveLocalStats, syncToServer]);

  // Effect for syncing on exit
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentStats = getLocalStats();
      if (currentStats && user) {
        // Use sendBeacon for reliable exit-syncing if available
        const statsRef = doc(db, 'user_stats', user.uid);
        const data = { ...currentStats, lastSynced: serverTimestamp() };
        const blob = new Blob([JSON.stringify({
            writes: [{
                update: {
                    name: `projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/user_stats/${user.uid}`,
                    currentDocument: { exists: true },
                    updateMask: { fieldPaths: Object.keys(data) }
                },
                update_transforms: [{
                    field_path: 'lastSynced',
                    set_to_server_value: 'REQUEST_TIME'
                }]
            }]
        })], { type: 'application/json' });

         // This is a simplified firestore REST call for beacon. 
         // A more robust solution might use a cloud function.
         // navigator.sendBeacon(`https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, blob);

         // Fallback to simple sync for now
         syncToServer(currentStats);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [getLocalStats, user, syncToServer]);

  const mergeStats = (local: UserStats | null, server: UserStats): UserStats => {
    if (!local) return server;

    // A simple "server wins" strategy for now. Could be made more complex.
    // For assessment results, merge them, giving precedence to local if it has more keys.
    const mergedAssessments = { ...(server.assessmentResults || {}), ...(local.assessmentResults || {}) };
    
    // For learned words, merge and sum counts
    const mergedLearnedWords: { [key in LanguageCode]?: number } = { ...(server.learnedWords || {}) };
    Object.entries(local.learnedWords || {}).forEach(([lang, count]) => {
      mergedLearnedWords[lang as LanguageCode] = Math.max(mergedLearnedWords[lang as LanguageCode] || 0, count || 0);
    });
    
    return {
      assessmentResults: mergedAssessments,
      learnedWords: mergedLearnedWords
    };
  };

  const updateLearnedPhrase = useCallback((phraseId: string, lang: LanguageCode, result: AssessmentResult) => {
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
      syncToServer(newStats); // Debounced sync could be an optimization here
      return newStats;
    });
  }, [saveLocalStats, syncToServer]);

  return { stats, loading, updateLearnedPhrase, setStats };
}

    