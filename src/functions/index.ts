
'use server';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as cors from 'cors';

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

const corsHandler = cors({origin: true});

interface UserStats {
  learnedWords: {[key: string]: number};
  assessmentResults: {[key: string]: object};
  lastSynced?: any;
}

// A more robust merge function
const mergeStats = (
  local: UserStats | null,
  server: UserStats | null
): UserStats => {
  const serverLearned = server?.learnedWords || {};
  const localLearned = local?.learnedWords || {};
  const serverAssessments = server?.assessmentResults || {};
  const localAssessments = local?.assessmentResults || {};

  const mergedLearnedWords: {[key: string]: number} = {...serverLearned};
  Object.entries(localLearned).forEach(([lang, count]) => {
    mergedLearnedWords[lang] = Math.max(
      mergedLearnedWords[lang] || 0,
      count || 0
    );
  });

  return {
    learnedWords: mergedLearnedWords,
    assessmentResults: {...serverAssessments, ...localAssessments},
  };
};

export const syncUserStats = onCall(async (request) => {
    logger.info('Sync request received.', {structuredData: true});

    if (!request.auth) {
      logger.warn('Sync request is unauthenticated.');
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const uid = request.auth.uid;
    const clientStats = request.data.stats as UserStats | null;
    const statsRef = db.collection('user_stats').doc(uid);

    logger.info(`Starting sync for user: ${uid}`, {uid});
    if (clientStats) {
      logger.info(`Client stats received for user: ${uid}`, {
        uid,
        clientStats,
      });
    } else {
      logger.info(`No client stats received for user: ${uid}`, {uid});
    }

    try {
      const docSnap = await statsRef.get();

      if (docSnap.exists()) {
        logger.info(`Existing stats found for user: ${uid}`, {uid});
        const serverStats = docSnap.data() as UserStats;
        const mergedStats = mergeStats(clientStats, serverStats);

        await statsRef.set(
          {
            ...mergedStats,
            lastSynced: Timestamp.now(),
          },
          {merge: true}
        );

        logger.info(`Successfully merged and updated stats for user: ${uid}`, {
          uid,
        });
        const finalStats = {
          ...mergedStats,
          lastSynced: new Date().toISOString(),
        };
        return {stats: finalStats};
      } else {
        logger.info(`No existing stats for user: ${uid}. Creating new document.`, {
          uid,
        });
        const newStats = clientStats || {learnedWords: {}, assessmentResults: {}};

        await statsRef.set({
          ...newStats,
          createdAt: Timestamp.now(),
          lastSynced: Timestamp.now(),
        });

        logger.info(`Successfully created new stats for user: ${uid}`, {uid});
        const finalStats = {
          ...newStats,
          createdAt: new Date().toISOString(),
          lastSynced: new Date().toISOString(),
        };
        return {stats: finalStats};
      }
    } catch (error: any) {
      logger.error('!!! CRITICAL: Error syncing user stats in Cloud Function.', {
        uid,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      throw new HttpsError('internal', 'Could not sync user stats.', error);
    }
  });
