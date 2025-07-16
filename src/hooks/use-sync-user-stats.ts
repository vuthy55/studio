
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, functions } from '@/lib/firebase';
import type { LanguageCode } from '@/lib/data';
import { httpsCallable } from 'firebase/functions';

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
const syncUserStats = httpsCallable(functions, 'syncUserStats');

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
    if (!user) return;
    if (isSyncing.current) return;
    
    isSyncing.current = true;
    try {
      await syncUserStats({ stats: statsToSync });
    } catch (error) {
      console.error("Cloud Function sync failed:", error);
    } finally {
      isSyncing.current = false;
    }
  }, [user]);

  // Main effect to orchestrate loading and syncing
  useEffect(() => {
    if (!user) {
      if (stats !== null) {
        setStats(null);
        localStorage.removeItem(STATS_STORAGE_KEY);
      }
      setLoading(false);
      return;
    }

    if (user && !hasSyncedFromServer.current) {
        setLoading(true);

        const initialLoad = async () => {
            const localStats = getLocalStats();
            if (localStats) {
                setStats(localStats);
            }

            try {
                const result: any = await syncUserStats({ stats: localStats });
                const serverStats = result.data.stats as UserStats;
                hasSyncedFromServer.current = true;
                
                if (serverStats) {
                    setStats(serverStats);
                    saveLocalStats(serverStats);
                } else if (!localStats) {
                    const defaultStats = { learnedWords: {}, assessmentResults: {} };
                    setStats(defaultStats);
                    saveLocalStats(defaultStats);
                }
            } catch (error) {
                console.error("Error fetching/syncing user stats via Cloud Function:", error);
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
  }, [user, getLocalStats, saveLocalStats, syncToServer]);


  const updateLearnedPhrase = useCallback((phraseId: string, lang: LanguageCode, result: AssessmentResult) => {
    setStats(currentStats => {
      const newStats = {
        ...(currentStats || { learnedWords: {}, assessmentResults: {} }),
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
