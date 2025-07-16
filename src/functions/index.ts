
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

interface UserStats {
  learnedWords: { [key: string]: number };
  assessmentResults: { [key: string]: object };
  lastSynced?: any;
}

const mergeStats = (local: UserStats | null, server: UserStats): UserStats => {
    if (!local) {
        return server;
    }
    
    const mergedAssessments = { ...(server.assessmentResults || {}), ...(local.assessmentResults || {}) };
    
    const mergedLearnedWords: { [key: string]: number } = { ...(server.learnedWords || {}) };
    Object.entries(local.learnedWords || {}).forEach(([lang, count]) => {
      mergedLearnedWords[lang] = Math.max(mergedLearnedWords[lang] || 0, count || 0);
    });
    
    return {
      assessmentResults: mergedAssessments,
      learnedWords: mergedLearnedWords
    };
};

export const syncUserStats = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const clientStats = request.data.stats as UserStats | null;
  const statsRef = db.collection("user_stats").doc(uid);

  logger.info(`Sync request for user: ${uid}`, { uid });

  try {
    const docSnap = await statsRef.get();

    if (docSnap.exists) {
      // Document exists, merge server and client data
      const serverStats = docSnap.data() as UserStats;
      const mergedStats = mergeStats(clientStats, serverStats);
      
      await statsRef.set({
        ...mergedStats,
        lastSynced: Timestamp.now(),
      }, { merge: true });

      logger.info(`Merged and updated stats for user: ${uid}`, { uid });
      return { stats: { ...mergedStats, lastSynced: new Date().toISOString() } };

    } else {
      // Document does not exist. Use client stats or create a new one.
      const newStats = clientStats || { learnedWords: {}, assessmentResults: {} };
      
      await statsRef.set({
        ...newStats,
        createdAt: Timestamp.now(),
        lastSynced: Timestamp.now(),
      });
      
      logger.info(`Created new stats document for user: ${uid}`, { uid });
      return { stats: { ...newStats, lastSynced: new Date().toISOString() } };
    }
  } catch (error) {
    logger.error("Error syncing user stats:", error, { uid });
    throw new HttpsError("internal", "Could not sync user stats.", error);
  }
});
