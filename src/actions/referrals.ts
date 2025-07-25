
'use server';

import { db } from '@/lib/firebase-admin';
import type { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';

export interface ReferredUser {
  id: string;
  name?: string;
  email: string;
  createdAt?: string;
}

/**
 * Fetches all users who were referred by a specific user.
 * @param referrerUid The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A promise that resolves to an array of referred user details.
 */
export async function getReferredUsers(referrerUid: string): Promise<ReferredUser[]> {
  if (!referrerUid) {
    return [];
  }

  try {
    const referralsRef = db.collection('referrals');
    const q = referralsRef.where('referrerUid', '==', referrerUid);
    const snapshot = await q.get();

    if (snapshot.empty) {
      return [];
    }
    
    const referredUids = snapshot.docs.map(doc => doc.data().referredUid);

    if (referredUids.length === 0) {
        return [];
    }

    const usersRef = db.collection('users');
    const usersQuery = usersRef.where('__name__', 'in', referredUids);
    const usersSnapshot = await usersQuery.get();

    return usersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            email: data.email,
            createdAt: (data.createdAt as Timestamp)?.toDate().toISOString(),
        }
    });

  } catch (error) {
    console.error("Error fetching referred users:", error);
    // In case of an error, return an empty array to prevent the client from crashing.
    return [];
  }
}

/**
 * Processes a referral, awarding a bonus to the referrer.
 * This is a secure server action that should be called after a new user signs up.
 * @param referralId The ID of the referral document to process.
 * @param newUserName The name of the new user who signed up.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function processReferral(referralId: string, newUserName: string): Promise<{success: boolean, error?: string}> {
  if (!referralId) {
    return { success: false, error: 'Referral ID is required.' };
  }

  const referralRef = db.collection('referrals').doc(referralId);

  try {
    return await db.runTransaction(async (transaction) => {
      const referralDoc = await transaction.get(referralRef);

      if (!referralDoc.exists) {
        throw new Error('Referral not found.');
      }

      const referralData = referralDoc.data()!;
      if (referralData.status !== 'pending') {
        // This prevents double-processing a referral
        console.log(`Referral ${referralId} already processed.`);
        return { success: true }; 
      }

      const { referrerUid } = referralData;
      const referrerRef = db.collection('users').doc(referrerUid);

      const referrerDoc = await transaction.get(referrerRef);
      if (!referrerDoc.exists) {
        // Referrer might have deleted their account, which is fine. Just mark as processed.
        transaction.update(referralRef, { status: 'processed_no_referrer' });
        return { success: true };
      }

      const appSettings = await getAppSettingsAction();
      const bonusAmount = appSettings.referralBonus;

      // 1. Award bonus to the referrer
      transaction.update(referrerRef, {
        tokenBalance: db.FieldValue.increment(bonusAmount),
      });

      // 2. Add transaction log for the referrer
      const logRef = referrerRef.collection('transactionLogs').doc();
      transaction.set(logRef, {
        actionType: 'referral_bonus',
        tokenChange: bonusAmount,
        timestamp: db.FieldValue.serverTimestamp(),
        description: `Bonus for referring new user: ${newUserName}`,
      });

      // 3. Mark the referral as completed
      transaction.update(referralRef, { status: 'completed' });

      return { success: true };
    });
  } catch (error: any) {
    console.error(`Error processing referral ${referralId}:`, error);
    // Attempt to mark as failed to prevent retries on permanent errors
    await referralRef.set({ status: 'failed', error: error.message }, { merge: true }).catch();
    return { success: false, error: 'Failed to process referral on the server.' };
  }
}
