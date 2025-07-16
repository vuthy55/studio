
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Initialize Firebase Admin SDK ONCE at the top level.
initializeApp();
const db = getFirestore();

interface UserStats {
  learnedWords: { [key: string]: number };
  assessmentResults: { [key: string]: object };
  lastSynced?: any;
}

// A more robust merge function that handles null/undefined inputs
const mergeStats = (local: UserStats | null, server: UserStats | null): UserStats => {
  const serverLearned = server?.learnedWords || {};
  const localLearned = local?.learnedWords || {};
  const serverAssessments = server?.assessmentResults || {};
  const localAssessments = local?.assessmentResults || {};

  const mergedLearnedWords: { [key:string]: number } = { ...serverLearned };
  Object.entries(localLearned).forEach(([lang, count]) => {
    mergedLearnedWords[lang] = Math.max(mergedLearnedWords[lang] || 0, count || 0);
  });

  return {
    learnedWords: mergedLearnedWords,
    assessmentResults: { ...serverAssessments, ...localAssessments },
  };
};

export const syncUserStats = onCall(async (request) => {
  logger.info("[syncUserStats] Function triggered.", { structuredData: true });

  if (!request.auth) {
    logger.warn("[syncUserStats] Unauthenticated call.", { uid: "none" });
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const clientStats = request.data.stats as UserStats | null;
  const statsRef = db.collection("user_stats").doc(uid);

  logger.info(`[syncUserStats] Starting sync for user: ${uid}`, { uid });

  try {
    const docSnap = await statsRef.get();
    logger.info(`[syncUserStats] Firestore document read for user: ${uid}. Exists: ${docSnap.exists}`, { uid });

    if (docSnap.exists) {
      const serverStats = docSnap.data() as UserStats;
      const mergedStats = mergeStats(clientStats, serverStats);

      logger.info(`[syncUserStats] Merged stats for user: ${uid}. Writing to Firestore.`, { uid });
      await statsRef.set({ ...mergedStats, lastSynced: Timestamp.now() }, { merge: true });

      const finalStats = { ...mergedStats, lastSynced: new Date().toISOString() };
      logger.info(`[syncUserStats] Successfully updated stats for user: ${uid}.`, { uid });
      return { stats: finalStats };

    } else {
      const newStats = clientStats || { learnedWords: {}, assessmentResults: {} };

      logger.info(`[syncUserStats] No document for user ${uid}. Creating new one.`, { uid });
      await statsRef.set({ ...newStats, createdAt: Timestamp.now(), lastSynced: Timestamp.now() });
      
      const finalStats = { ...newStats, createdAt: new Date().toISOString(), lastSynced: new Date().toISOString() };
      logger.info(`[syncUserStats] Successfully created stats for user: ${uid}.`, { uid });
      return { stats: finalStats };
    }
  } catch (error: any) {
    logger.error(`[syncUserStats] !!! CRITICAL ERROR for user ${uid}: ${error.message}`, {
      uid,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    throw new HttpsError("internal", "Could not sync user stats.", error.message);
  }
});
