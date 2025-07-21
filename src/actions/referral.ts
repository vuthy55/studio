'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, runTransaction, doc, getDoc, collection, addDoc, serverTimestamp, WriteBatch } from 'firebase-admin/firestore';
import { getAppSettings, type AppSettings } from '@/services/settings';


/**
 * Processes a referral by awarding a bonus to the referrer.
 * This is a server action and should only be called from a trusted server environment.
 * @param referrerUid The UID of the user who referred someone.
 * @param referredUid The UID of the new user who was referred.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function processReferral(referrerUid: string, newUserId: string): Promise<{success: boolean, message: string}> {
  if (!referrerUid || !newUserId) {
    return { success: false, message: 'Referrer and new user IDs are required.' };
  }

  try {
    const settings = await getAppSettings();
    const referralBonus = settings.referralBonus;

    if (!referralBonus || referralBonus <= 0) {
      return { success: false, message: 'Referral bonus is not configured or is zero.' };
    }
    
    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      const referrerRef = db.collection('users').doc(referrerUid);
      const referrerDoc = await transaction.get(referrerRef);

      if (!referrerDoc.exists) {
        throw new Error(`Referrer with ID ${referrerUid} not found.`);
      }

      // 1. Update referrer's token balance
      transaction.update(referrerRef, {
        tokenBalance: FieldValue.increment(referralBonus)
      });

      // 2. Create a transaction log for the referrer
      const transactionLogRef = referrerRef.collection('transactionLogs').doc();
      transaction.set(transactionLogRef, {
        actionType: 'referral_bonus',
        tokenChange: referralBonus,
        timestamp: FieldValue.serverTimestamp(),
        description: `Referral bonus for inviting new user ${newUserId}`
      });

      // 3. Create a referral record for tracking purposes
      const referralRef = db.collection('referrals').doc();
       transaction.set(referralRef, {
        referrerUid,
        referredUid: newUserId,
        status: 'completed',
        bonusAwarded: referralBonus,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: 'Referral bonus awarded successfully.' };

  } catch (error: any) {
    console.error("Error processing referral:", error);
    // Don't expose detailed internal errors to the client
    return { success: false, message: 'An internal server error occurred while processing the referral.' };
  }
}
