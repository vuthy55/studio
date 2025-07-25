
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
 * Creates a new user document and processes a referral in a single transaction.
 * This is a secure server action that should be called after a new user signs up.
 * @param referrerUid The UID of the user who made the referral.
 * @param newUser The user object of the new user who signed up.
 * @param userData Additional profile data for the new user.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function processNewUserAndReferral(
  newUser: {uid: string; name: string; email: string}, 
  userData: {country: string, mobile: string, defaultLanguage: string},
  referrerUid?: string | null
): Promise<{success: boolean, error?: string}> {
  console.log('[DEBUG] processNewUserAndReferral: Triggered.');
  console.log(`[DEBUG] New User: ${JSON.stringify(newUser)}, Referrer UID: ${referrerUid}`);

  if (!newUser?.uid || !newUser.email) {
    return { success: false, error: 'New user info (UID and Email) is required.' };
  }

  const newUserRef = db.collection('users').doc(newUser.uid);

  try {
    const appSettings = await getAppSettingsAction();
    const signupBonus = appSettings.signupBonus;

    return await db.runTransaction(async (transaction) => {
      console.log('[DEBUG] processNewUserAndReferral: Starting Firestore transaction.');
      
      const newUserDoc = await transaction.get(newUserRef);
      if (newUserDoc.exists) {
        console.error(`[DEBUG] Error: User ${newUser.uid} already exists. This should not happen in this flow.`);
        // Don't throw, just return success as the user does exist.
        return { success: true };
      }

      // 1. Create the new user's document
      const newUserPayload: any = {
        name: newUser.name || '',
        email: newUser.email.toLowerCase(),
        country: userData.country,
        mobile: userData.mobile,
        defaultLanguage: userData.defaultLanguage,
        role: 'user',
        tokenBalance: signupBonus,
        syncLiveUsage: 0,
        syncOnlineUsage: 0,
        searchableName: (newUser.name || '').toLowerCase(),
        searchableEmail: (newUser.email || '').toLowerCase(),
        createdAt: db.FieldValue.serverTimestamp(),
      };
      
      // 2. Add signup bonus transaction log
      const signupLogRef = newUserRef.collection('transactionLogs').doc();
      transaction.set(signupLogRef, {
        actionType: 'signup_bonus',
        tokenChange: signupBonus,
        timestamp: db.FieldValue.serverTimestamp(),
        description: 'Welcome bonus for signing up!'
      });
      console.log('[DEBUG] Set signup bonus log for new user.');


      // 3. Handle referral logic if a referrerUid is provided
      if (referrerUid) {
        console.log(`[DEBUG] Processing referral for referrer: ${referrerUid}`);
        const referrerRef = db.collection('users').doc(referrerUid);
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`[DEBUG] CRITICAL ERROR: Referrer with UID ${referrerUid} not found. Aborting referral process but creating user.`);
          // If referrer doesn't exist, we can't give a bonus, but we should still create the user.
          // The transaction will just skip the referral-specific parts.
        } else {
            console.log('[DEBUG] Referrer found. Proceeding with bonus logic.');
            const referrerData = referrerDoc.data()!;
            const bonusAmount = appSettings.referralBonus;

            // Mark who referred the new user
            newUserPayload.referredBy = referrerUid;

            // Award bonus to the referrer
            transaction.update(referrerRef, {
                tokenBalance: db.FieldValue.increment(bonusAmount),
            });
            console.log(`[DEBUG] Awarded ${bonusAmount} tokens to referrer ${referrerUid}.`);


            // Add transaction log for the referrer
            const referralLogRef = referrerRef.collection('transactionLogs').doc();
            transaction.set(referralLogRef, {
                actionType: 'referral_bonus',
                tokenChange: bonusAmount,
                timestamp: db.FieldValue.serverTimestamp(),
                description: `Bonus for referring new user: ${newUser.name || newUser.email}`,
            });
            console.log(`[DEBUG] Created transaction log for referrer.`);

            
            // Create a permanent, detailed referral record
            const referralLedgerRef = db.collection('referrals').doc(`${referrerUid}_${newUser.uid}`);
            transaction.set(referralLedgerRef, {
                referrerUid,
                referrerEmail: referrerData.email,
                referrerName: referrerData.name,
                referredUid: newUser.uid,
                referredEmail: newUser.email,
                referredName: newUser.name || newUser.email,
                bonusAwarded: bonusAmount,
                status: 'complete',
                createdAt: db.FieldValue.serverTimestamp(),
            });
            console.log(`[DEBUG] Created entry in main referrals ledger.`);
            
            // Create notification for the referrer
            const notificationRef = db.collection('notifications').doc();
            transaction.set(notificationRef, {
                userId: referrerUid,
                type: 'referral_bonus',
                message: `You earned ${bonusAmount} tokens! ${newUser.name || newUser.email} just signed up with your link.`,
                fromUserName: 'VibeSync System',
                createdAt: db.FieldValue.serverTimestamp(),
                read: false,
            });
            console.log(`[DEBUG] Created notification for referrer.`);
        }
      }

      // Finally, set the new user's document with all the data
      transaction.set(newUserRef, newUserPayload);
      console.log('[DEBUG] Set main document for new user.');


      console.log('[DEBUG] processNewUserAndReferral: Transaction operations defined. Ready to commit.');
      return { success: true };
    });
  } catch (error: any) {
    console.error(`[DEBUG] CRITICAL ERROR in transaction for new user ${newUser.uid}:`, error);
    return { success: false, error: 'Failed to process new user and referral on the server.' };
  }
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
    // Firestore 'in' queries are limited to 10 items. For a more robust solution with many referrals,
    // you would need to batch these queries. For this app's scale, this is acceptable.
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
 * Fetches all referral records for the admin dashboard ledger.
 * @returns {Promise<ReferralLedgerEntry[]>} A promise resolving to an array of ledger entries.
 */
export async function getReferralLedger(emailFilter: string = ''): Promise<ReferralLedgerEntry[]> {
    try {
        const referralsRef = db.collection('referrals');
        let querySnapshot;
        const lowercasedFilter = emailFilter.toLowerCase().trim();

        if (!lowercasedFilter) {
            return [];
        }

        if (lowercasedFilter === '*') {
            const q = referralsRef.orderBy('createdAt', 'desc');
            querySnapshot = await q.get();
        } else {
            // Firestore doesn't support OR queries on different fields.
            // We must perform two separate queries and merge the results.
            const referrerQuery = referralsRef.where('referrerEmail', '==', lowercasedFilter);
            const referredQuery = referralsRef.where('referredEmail', '==', lowercasedFilter);
            
            const [referrerSnapshot, referredSnapshot] = await Promise.all([
                referrerQuery.get(),
                referredQuery.get(),
            ]);
            
            const combinedDocs = new Map();
            referrerSnapshot.forEach(doc => combinedDocs.set(doc.id, doc));
            referredSnapshot.forEach(doc => combinedDocs.set(doc.id, doc));
            
            const uniqueDocs = Array.from(combinedDocs.values());
            querySnapshot = { docs: uniqueDocs, empty: uniqueDocs.length === 0 };
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
        if (lowercasedFilter !== '*' && entries.length > 1) {
            entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        return entries;

    } catch (error) {
        console.error("Error fetching referral ledger:", error);
        return [];
    }
}
