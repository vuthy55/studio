
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

export interface ReferralLedgerEntry {
    id: string;
    referrerUid: string;
    referrerEmail: string;
    referrerName: string;
    referredUid: string;
    referredEmail: string;
    referredName: string;
    bonusAwarded: number;
    status: 'complete';
    createdAt: string; // ISO String
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
 * Processes a referral, awarding a bonus to the referrer and creating a permanent ledger record.
 * This is a secure server action that should be called after a new user signs up.
 * @param referrerUid The UID of the user who made the referral.
 * @param newUser The user object of the new user who signed up.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function processReferral(referrerUid: string, newUser: {uid: string; name: string; email: string}): Promise<{success: boolean, error?: string}> {
  if (!referrerUid || !newUser?.uid) {
    return { success: false, error: 'Referrer UID and new user info are required.' };
  }

  const referrerRef = db.collection('users').doc(referrerUid);

  try {
    return await db.runTransaction(async (transaction) => {
      const referrerDoc = await transaction.get(referrerRef);
      if (!referrerDoc.exists) {
        // Referrer might have deleted their account.
        console.warn(`Referrer with UID ${referrerUid} not found. Cannot award bonus.`);
        return { success: false, error: "Referrer account not found." };
      }
      const referrerData = referrerDoc.data()!;

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
        description: `Bonus for referring new user: ${newUser.name}`,
      });
      
      // 3. Create a permanent, detailed referral record for the admin ledger
      const referralLedgerRef = db.collection('referrals').doc(`${referrerUid}_${newUser.uid}`);
      transaction.set(referralLedgerRef, {
        referrerUid: referrerUid,
        referrerEmail: referrerData.email,
        referrerName: referrerData.name,
        referredUid: newUser.uid,
        referredEmail: newUser.email,
        referredName: newUser.name,
        bonusAwarded: bonusAmount,
        status: 'complete',
        createdAt: db.FieldValue.serverTimestamp(),
      });


      return { success: true };
    });
  } catch (error: any) {
    console.error(`Error processing referral for referrer ${referrerUid}:`, error);
    return { success: false, error: 'Failed to process referral on the server.' };
  }
}

/**
 * Fetches all referral records for the admin dashboard ledger.
 * @returns {Promise<ReferralLedgerEntry[]>} A promise resolving to an array of ledger entries.
 */
export async function getReferralLedger(emailFilter: string = ''): Promise<ReferralLedgerEntry[]> {
    try {
        const referralsRef = db.collection('referrals');
        let querySnapshot;

        if (emailFilter && emailFilter !== '*') {
            const lowercasedEmail = emailFilter.toLowerCase().trim();
            // Firestore doesn't support OR queries on different fields.
            // We must perform two separate queries and merge the results.
            const referrerQuery = referralsRef.where('referrerEmail', '==', lowercasedEmail);
            const referredQuery = referralsRef.where('referredEmail', '==', lowercasedEmail);
            
            const [referrerSnapshot, referredSnapshot] = await Promise.all([
                getDocs(referrerQuery),
                getDocs(referredQuery),
            ]);
            
            const combinedDocs = new Map();
            referrerSnapshot.forEach(doc => combinedDocs.set(doc.id, doc));
            referredSnapshot.forEach(doc => combinedDocs.set(doc.id, doc));
            
            const uniqueDocs = Array.from(combinedDocs.values());
            querySnapshot = { docs: uniqueDocs, empty: uniqueDocs.length === 0 };

        } else {
            const q = referralsRef.where('status', '==', 'complete').orderBy('createdAt', 'desc');
            querySnapshot = await getDocs(q);
        }
        
        if (querySnapshot.empty) {
            return [];
        }

        const entries = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                referrerUid: data.referrerUid,
                referrerEmail: data.referrerEmail,
                referrerName: data.referrerName,
                referredUid: data.referredUid,
                referredEmail: data.referredEmail,
                referredName: data.referredName,
                bonusAwarded: data.bonusAwarded,
                status: 'complete',
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
            };
        });
        
        // Sort manually if we merged queries, as we can't order by creation time in that case.
        if (emailFilter && emailFilter !== '*') {
            entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        return entries;

    } catch (error) {
        console.error("Error fetching referral ledger:", error);
        return [];
    }
}
