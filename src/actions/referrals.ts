
'use server';

import { db, auth } from '@/lib/firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';
import type { UserProfile, ReferralLedgerEntry, ReferredUser } from '@/lib/types';


export interface NewUserPayload {
    name: string;
    email: string;
    password?: string; // Optional for social logins
    country: string;
    mobile: string;
    defaultLanguage: string;
}

/**
 * Creates a new user auth record, firestore document, and processes a referral in a single, atomic server action.
 * This is the sole entry point for creating new users in the application.
 * @param userData The new user's profile data.
 * @param referrerUid The optional UID of the user who made the referral.
 * @returns {Promise<{success: boolean, error?: string, user?: {uid: string, email: string, name: string}}>} An object indicating success or failure.
 */
export async function processNewUserAndReferral(
  userData: NewUserPayload,
  referrerUid?: string | null
): Promise<{success: boolean; error?: string; user?: {uid: string, email: string | null, name: string | null} }> {
  const { name, email, password, country, mobile, defaultLanguage } = userData;
  console.log(`[SERVER ACTION] processNewUserAndReferral: Triggered for new user ${email} with referrer ${referrerUid || 'None'}`);

  if (!email || !name) {
    const errorMsg = 'Critical Error: New user info (Email and Name) is required.';
    console.error(`[SERVER ACTION] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  let newUserRecord;
  try {
    // Step 1: Create the user in Firebase Authentication
    // A password is required for email/password sign-up
    if(!password) {
        return { success: false, error: "A password is required for email sign-up." };
    }
    newUserRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: name,
    });
    console.log(`[SERVER ACTION] Successfully created auth record for UID: ${newUserRecord.uid}`);
  } catch (error: any) {
    console.error(`[SERVER ACTION] Firebase Auth user creation failed for email ${email}:`, error);
    // Provide a more user-friendly error message
    if (error.code === 'auth/email-already-exists') {
        return { success: false, error: 'An account with this email address already exists.' };
    }
    return { success: false, error: error.message || 'An unexpected error occurred during account creation.' };
  }


  const newUserRef = db.collection('users').doc(newUserRecord.uid);

  try {
    console.log('[SERVER ACTION] processNewUserAndReferral: Fetching app settings.');
    const appSettings = await getAppSettingsAction();
    const signupBonus = appSettings.signupBonus;
    console.log(`[SERVER ACTION] processNewUserAndReferral: Signup bonus is ${signupBonus}.`);

    await db.runTransaction(async (transaction) => {
      console.log('[SERVER ACTION] processNewUserAndReferral: Starting Firestore transaction.');
      
      const newUserPayload: any = {
        name: name,
        email: email.toLowerCase(),
        country: country,
        mobile: mobile,
        defaultLanguage: defaultLanguage,
        role: 'user',
        tokenBalance: signupBonus,
        syncLiveUsage: 0,
        syncOnlineUsage: 0,
        searchableName: name.toLowerCase(),
        searchableEmail: email.toLowerCase(),
        createdAt: db.FieldValue.serverTimestamp(),
      };
      
      const signupLogRef = newUserRef.collection('transactionLogs').doc();
      transaction.set(signupLogRef, {
        actionType: 'signup_bonus',
        tokenChange: signupBonus,
        timestamp: db.FieldValue.serverTimestamp(),
        description: 'Welcome bonus for signing up!'
      });
      console.log('[SERVER ACTION] Set signup bonus log for new user.');


      if (referrerUid) {
        console.log(`[SERVER ACTION] Processing referral for referrer: ${referrerUid}`);
        const referrerRef = db.collection('users').doc(referrerUid);
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`[SERVER ACTION] CRITICAL WARNING: Referrer with UID ${referrerUid} not found. Proceeding without referral bonus.`);
        } else {
            console.log('[SERVER ACTION] Referrer found. Proceeding with bonus logic.');
            const referrerData = referrerDoc.data()!;
            const bonusAmount = appSettings.referralBonus;
            newUserPayload.referredBy = referrerUid;
            transaction.update(referrerRef, { tokenBalance: db.FieldValue.increment(bonusAmount) });
            console.log(`[SERVER ACTION] Awarded ${bonusAmount} tokens to referrer ${referrerUid}.`);
            
            const referralLogRef = referrerRef.collection('transactionLogs').doc();
            transaction.set(referralLogRef, {
                actionType: 'referral_bonus',
                tokenChange: bonusAmount,
                timestamp: db.FieldValue.serverTimestamp(),
                description: `Bonus for referring new user: ${name || email}`,
            });
            console.log(`[SERVER ACTION] Created transaction log for referrer.`);

            const referralLedgerRef = db.collection('referrals').doc(`${referrerUid}_${newUserRecord.uid}`);
            transaction.set(referralLedgerRef, {
                referrerUid,
                referrerEmail: referrerData.email,
                referrerName: referrerData.name,
                referredUid: newUserRecord.uid,
                referredEmail: email,
                referredName: name,
                bonusAwarded: bonusAmount,
                status: 'complete',
                createdAt: db.FieldValue.serverTimestamp(),
            });
            console.log(`[SERVER ACTION] Created entry in main referrals ledger.`);
            
            const notificationRef = db.collection('notifications').doc();
            transaction.set(notificationRef, {
                userId: referrerUid,
                type: 'referral_bonus',
                message: `You earned ${bonusAmount} tokens! ${name} just signed up with your link.`,
                fromUserName: 'VibeSync System',
                createdAt: db.FieldValue.serverTimestamp(),
                read: false,
            });
            console.log(`[SERVER ACTION] Created notification for referrer.`);
        }
      }
      
      transaction.set(newUserRef, newUserPayload);
      console.log('[SERVER ACTION] Set main document for new user.');
      console.log('[SERVER ACTION] processNewUserAndReferral: Transaction operations defined. Ready to commit.');
    });

    console.log("[SERVER ACTION] Transaction completed successfully.");
    return { success: true, user: { uid: newUserRecord.uid, email: newUserRecord.email || null, name: newUserRecord.displayName || null } };

  } catch (error: any) {
    console.error(`[SERVER ACTION] CRITICAL ERROR in Firestore transaction for new user ${email}:`, error);
    // Attempt to delete the orphaned auth user if the Firestore part fails
    await auth.deleteUser(newUserRecord.uid);
    console.error(`[SERVER ACTION] Rolled back and deleted orphaned auth user ${newUserRecord.uid}`);
    return { success: false, error: error.message || 'An unexpected server error occurred during database profile creation.' };
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

    
