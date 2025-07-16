
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import type { LanguageCode } from '@/lib/data';
import { doc, getDoc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';

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

const mergeStats = (local: UserStats, server: UserStats): UserStats => {
  const serverLearned = server?.learnedWords || {};
  const localLearned = local?.learnedWords || {};
  const serverAssessments = server?.assessmentResults || {};
  const localAssessments = local?.assessmentResults || {};

  const mergedLearnedWords: { [key: string]: number } = { ...serverLearned };
  Object.entries(localLearned).forEach(([lang, count]) => {
    mergedLearnedWords[lang as LanguageCode] = Math.max(mergedLearnedWords[lang as LanguageCode] || 0, count || 0);
  });

  return {
    learnedWords: mergedLearnedWords,
    assessmentResults: { ...serverAssessments, ...localAssessments },
  };
};

export function useSyncUserStats() {
  const [user] = useAuthState(auth);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);

  const getLocalStats = useCallback((): UserStats | null => {
    if (typeof window === 'undefined') return null;
    try {
      const cachedStats = localStorage.getItem(STATS_STORAGE_KEY);
      return cachedStats ? JSON.parse(cachedStats) : null;
    } catch (error) {
      console.error("Failed to read from localStorage", error);
      return null;
    }
  }, []);

  const saveLocalStats = useCallback((newStats: UserStats | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (newStats) {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
      } else {
        localStorage.removeItem(STATS_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to write to localStorage", error);
    }
  }, []);

  const syncToServer = useCallback(async (statsToSync: UserStats) => {
    if (!user || !statsToSync) return;
    const statsRef = doc(db, 'user_stats', user.uid);
    try {
      await setDoc(statsRef, { ...statsToSync, lastSynced: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error("Firestore sync failed:", error);
    }
  }, [user]);

  useEffect(() => {
    const loadAndSync = async () => {
      if (!user) {
        setStats(null);
        saveLocalStats(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const localStats = getLocalStats();
      if(localStats) {
          setStats(localStats);
      }

      try {
        const statsRef = doc(db, 'user_stats', user.uid);
        const docSnap = await getDoc(statsRef);

        if (docSnap.exists()) {
          const serverStats = docSnap.data() as UserStats;
          const mergedStats = mergeStats(localStats || { learnedWords: {}, assessmentResults: {} }, serverStats);
          setStats(mergedStats);
          saveLocalStats(mergedStats);
        } else {
          // No server stats, use local or create new
          const initialStats = localStats || { learnedWords: {}, assessmentResults: {} };
          setStats(initialStats);
          saveLocalStats(initialStats);
          await syncToServer(initialStats); // First-time sync
        }
      } catch (error) {
        console.error("Error fetching/syncing user stats from Firestore:", error);
        // Rely on local stats if server is unreachable
        if (!localStats) {
           setStats({ learnedWords: {}, assessmentResults: {} });
        }
      } finally {
        setLoading(false);
      }
    };

    loadAndSync();
  }, [user, getLocalStats, saveLocalStats, syncToServer]);

  const updateLearnedPhrase = useCallback((phraseId: string, lang: LanguageCode, result: AssessmentResult) => {
    setStats(currentStats => {
      const newStats: UserStats = {
        learnedWords: { ...currentStats?.learnedWords },
        assessmentResults: { ...currentStats?.assessmentResults },
      };

      const wasAlreadyPassed = newStats.assessmentResults[phraseId]?.status === 'pass';
      newStats.assessmentResults[phraseId] = result;

      if (result.status === 'pass' && !wasAlreadyPassed) {
        newStats.learnedWords[lang] = (newStats.learnedWords[lang] || 0) + 1;
      } else if (result.status !== 'pass' && wasAlreadyPassed) {
        newStats.learnedWords[lang] = Math.max(0, (newStats.learnedWords[lang] || 1) - 1);
      }
      
      saveLocalStats(newStats);
      
      // Debounce sync to server
      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }
      syncTimeout.current = setTimeout(() => {
        syncToServer(newStats);
      }, 2000);

      return newStats;
    });
  }, [saveLocalStats, syncToServer]);

  return { stats, loading, updateLearnedPhrase, setStats };
}
