
'use server';

import { auth, db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';
import { getFreeLanguagePacks } from './audiopack-admin';
import type { SyncRoom, Vibe } from '@/lib/types';
import type { UserRecord } from 'firebase-admin/auth';

interface SignUpPayload {
  name: string;
  email: string;
  password?: string; // Optional for Google Sign-In
  country?: string;
  mobile?: string;
  defaultLanguage?: string;
  photoURL?: string;
}

/**
 * Creates a new user in Firebase Authentication and Firestore,
 * and handles referral bonuses if applicable.
 * If a roomId or vibeId is provided, it returns the relevant status.
 * This is a secure server-side action.
 */
export async function signUpUser(
  payload: SignUpPayload,
  referralId: string | null,
  roomId?: string | null,
  vibeId?: string | null
): Promise<{
  success: boolean;
  error?: string;
  userId?: string;
  // Room specific
  roomStatus?: 'active' | 'scheduled' | 'closed';
  scheduledAt?: string;
  roomTopic?: string; // Added to provide more context on redirect
  // Vibe specific - No longer returning vibeExists to simplify client logic
}> {
  const { name, email, password, country, mobile, defaultLanguage, photoURL } = payload;
  const lowerCaseEmail = email.toLowerCase();
  
  console.log('[signUpUser] Initiated for email:', lowerCaseEmail);

  try {
    // --- Step 1: Fetch all necessary settings and data first ---
    const settings = await getAppSettingsAction();
    const signupBonus = settings.signupBonus || 100;
    const referralBonus = settings.referralBonus || 150;
    const freeLanguages = await getFreeLanguagePacks();

    let referrerDoc = null;
    if (referralId) {
        const referrerRef = db.collection('users').doc(referralId);
        referrerDoc = await referrerRef.get();
        if (!referrerDoc.exists) {
            console.warn('[signUpUser] Referrer with ID', referralId, 'does not exist. Proceeding without referral.');
        }
    }

    // --- Step 2: Get or Create User in Firebase Auth ---
    let userRecord: UserRecord;
    try {
        // This will succeed for Google Sign-In or if the email is already in Auth
        userRecord = await auth.getUserByEmail(lowerCaseEmail);
        console.log('[signUpUser] Found existing user in Auth. UID:', userRecord.uid);
    } catch (error: any) {
        // This is the expected path for a brand new email/password signup
        if (error.code === 'auth/user-not-found') {
            console.log('[signUpUser] User not found in Auth, creating new one...');
            userRecord = await auth.createUser({
                email: lowerCaseEmail,
                password: password,
                displayName: name,
                photoURL: photoURL
            });
            console.log('[signUpUser] New user created successfully in Auth. UID:', userRecord.uid);
        } else {
            // Re-throw other errors (like malformed email)
            throw error;
        }
    }
    const uid = userRecord.uid;

    // --- Step 3: Check if Firestore document already exists ---
    const newUserRef = db.collection('users').doc(uid);
    const userDocSnapshot = await newUserRef.get();
    if (userDocSnapshot.exists) {
        console.log('[signUpUser] Firestore document already exists for this user. Skipping creation.');
    } else {
        // --- Step 4: Perform all database writes in a single atomic batch ---
        console.log('[signUpUser] Firestore document not found. Creating atomic database batch...');
        const batch = db.batch();

        const newUserProfile: any = {
            name: name,
            email: lowerCaseEmail,
            role: 'user',
            tokenBalance: signupBonus,
            syncLiveUsage: 0,
            syncOnlineUsage: 0,
            searchableName: name.toLowerCase(),
            searchableEmail: lowerCaseEmail,
            createdAt: FieldValue.serverTimestamp(),
            country: country || '',
            mobile: mobile || '',
            defaultLanguage: defaultLanguage || 'en-US',
            photoURL: photoURL || null,
            unlockedLanguages: freeLanguages,
            downloadedPacks: freeLanguages,
            downloadedPhraseCount: 0,
        };
        batch.set(newUserRef, newUserProfile);
        console.log('[signUpUser] Added new user profile creation to batch.');

        const newUserLogRef = newUserRef.collection('transactionLogs').doc();
        batch.set(newUserLogRef, {
            actionType: 'signup_bonus',
            tokenChange: signupBonus,
            timestamp: FieldValue.serverTimestamp(),
            description: 'Welcome bonus for signing up.',
        });
        console.log('[signUpUser] Added signup bonus transaction log to batch.');

        if (referralId && referrerDoc && referrerDoc.exists) {
            const referrerRef = referrerDoc.ref;
            const referralRecordRef = db.collection('referrals').doc();
            batch.set(referralRecordRef, {
                referrerId: referralId,
                referredUserId: uid,
                referredUserName: name,
                referredUserEmail: lowerCaseEmail,
                createdAt: FieldValue.serverTimestamp(),
            });
            batch.update(referrerRef, { tokenBalance: FieldValue.increment(referralBonus) });
            const referrerLogRef = referrerRef.collection('transactionLogs').doc();
            batch.set(referrerLogRef, {
                actionType: 'referral_bonus',
                tokenChange: referralBonus,
                timestamp: FieldValue.serverTimestamp(),
                description: `Bonus for referring new user: ${lowerCaseEmail}`,
            });
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: referralId,
                type: 'referral_bonus',
                message: `Congratulations! ${name} has signed up using your link. You've received ${referralBonus} tokens!`,
                fromUserName: name,
                amount: referralBonus,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        }
        
        const invitationsRef = db.collection('invitations');
        const q = invitationsRef.where('invitedEmail', '==', lowerCaseEmail).limit(1);
        const invitationSnapshot = await q.get();
        if (!invitationSnapshot.empty) {
            const invitationDoc = invitationSnapshot.docs[0];
            batch.delete(invitationDoc.ref);
        }
        
        console.log('[signUpUser] Committing batch to Firestore...');
        await batch.commit();
        console.log('[signUpUser] Batch committed successfully.');
    }

    // --- Step 5: Handle Post-Signup Logic (Room or Vibe) ---
    if (vibeId) {
        const vibeRef = db.collection('vibes').doc(vibeId);
        await vibeRef.update({
            invitedEmails: FieldValue.arrayUnion(lowerCaseEmail)
        });
        console.log(`[signUpUser] Ensured ${lowerCaseEmail} is on invited list for Vibe ${vibeId}`);
    }

    if (roomId) {
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();
        if (roomDoc.exists) {
            const roomData = roomDoc.data() as SyncRoom;
            return { 
                success: true, 
                userId: uid, 
                roomStatus: roomData.status,
                roomTopic: roomData.topic,
                scheduledAt: (roomData.scheduledAt as Timestamp)?.toDate().toISOString()
            };
        }
    }
    
    return { success: true, userId: uid };

  } catch (error: any) {
    console.error("[signUpUser] CRITICAL ERROR during user signup:", error);
    if (error.code === 'auth/email-already-exists' && payload.password) {
      return { success: false, error: 'This email address is already in use by another account.' };
    }
    return { success: false, error: error.message || 'An unexpected server error occurred.' };
  }
}
