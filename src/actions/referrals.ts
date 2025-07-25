
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
  console.log(`[SERVER ACTION] processNewUserAndReferral: Triggered for new user ${newUser.email} with referrer ${referrerUid || 'None'}`);

  if (!newUser?.uid || !newUser.email || !newUser.name) {
    const errorMsg = 'Critical Error: New user info (UID, Email, and Name) is required.';
    console.error(`[SERVER ACTION] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const newUserRef = db.collection('users').doc(newUser.uid);

  try {
    console.log('[SERVER ACTION] processNewUserAndReferral: Fetching app settings.');
    const appSettings = await getAppSettingsAction();
    const signupBonus = appSettings.signupBonus;
    console.log(`[SERVER ACTION] processNewUserAndReferral: Signup bonus is ${signupBonus}.`);

    await db.runTransaction(async (transaction) => {
      console.log('[SERVER ACTION] processNewUserAndReferral: Starting Firestore transaction.');
      
      // 1. Create the new user's document
      const newUserPayload: any = {
        name: newUser.name,
        email: newUser.email.toLowerCase(),
        country: userData.country,
        mobile: userData.mobile,
        defaultLanguage: userData.defaultLanguage,
        role: 'user',
        tokenBalance: signupBonus,
        syncLiveUsage: 0,
        syncOnlineUsage: 0,
        searchableName: newUser.name.toLowerCase(),
        searchableEmail: newUser.email.toLowerCase(),
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
      console.log('[SERVER ACTION] Set signup bonus log for new user.');


      // 3. Handle referral logic if a referrerUid is provided
      if (referrerUid) {
        console.log(`[SERVER ACTION] Processing referral for referrer: ${referrerUid}`);
        const referrerRef = db.collection('users').doc(referrerUid);
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          // This is a critical failure that should abort the transaction.
          console.error(`[SERVER ACTION] CRITICAL ERROR: Referrer with UID ${referrerUid} not found. Aborting transaction.`);
          throw new Error(`Referrer with UID ${referrerUid} not found.`);
        } 
        
        console.log('[SERVER ACTION] Referrer found. Proceeding with bonus logic.');
        const referrerData = referrerDoc.data()!;
        const bonusAmount = appSettings.referralBonus;

        // Mark who referred the new user
        newUserPayload.referredBy = referrerUid;

        // Award bonus to the referrer
        transaction.update(referrerRef, {
            tokenBalance: db.FieldValue.increment(bonusAmount),
        });
        console.log(`[SERVER ACTION] Awarded ${bonusAmount} tokens to referrer ${referrerUid}.`);


        // Add transaction log for the referrer
        const referralLogRef = referrerRef.collection('transactionLogs').doc();
        transaction.set(referralLogRef, {
            actionType: 'referral_bonus',
            tokenChange: bonusAmount,
            timestamp: db.FieldValue.serverTimestamp(),
            description: `Bonus for referring new user: ${newUser.name || newUser.email}`,
        });
        console.log(`[SERVER ACTION] Created transaction log for referrer.`);

        
        // Create a permanent, detailed referral record
        const referralLedgerRef = db.collection('referrals').doc(`${referrerUid}_${newUser.uid}`);
        transaction.set(referralLedgerRef, {
            referrerUid,
            referrerEmail: referrerData.email,
            referrerName: referrerData.name,
            referredUid: newUser.uid,
            referredEmail: newUser.email,
            referredName: newUser.name,
            bonusAwarded: bonusAmount,
            status: 'complete',
            createdAt: db.FieldValue.serverTimestamp(),
        });
        console.log(`[SERVER ACTION] Created entry in main referrals ledger.`);
        
        // Create notification for the referrer
        const notificationRef = db.collection('notifications').doc();
        transaction.set(notificationRef, {
            userId: referrerUid,
            type: 'referral_bonus',
            message: `You earned ${bonusAmount} tokens! ${newUser.name} just signed up with your link.`,
            fromUserName: 'VibeSync System',
            createdAt: db.FieldValue.serverTimestamp(),
            read: false,
        });
        console.log(`[SERVER ACTION] Created notification for referrer.`);
      }

      // Finally, set the new user's document with all the data
      transaction.set(newUserRef, newUserPayload);
      console.log('[SERVER ACTION] Set main document for new user.');


      console.log('[SERVER ACTION] processNewUserAndReferral: Transaction operations defined. Ready to commit.');
    });

    console.log("[SERVER ACTION] Transaction completed successfully.");
    return { success: true };

  } catch (error: any) {
    console.error(`[SERVER ACTION] CRITICAL ERROR in processNewUserAndReferral for new user ${newUser.email}:`, error);
    // Return the specific error message from Firestore or other services
    return { success: false, error: error.message || 'An unexpected server error occurred.' };
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
