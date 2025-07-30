
'use server';

import { auth, db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';
import { getFreeLanguagePacks } from './audiopack-admin';
import type { SyncRoom } from '@/lib/types';

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
 * If a roomId is provided, it returns the room's status.
 * This is a secure server-side action.
 */
export async function signUpUser(
  payload: SignUpPayload,
  referralId: string | null,
  roomId?: string | null
): Promise<{
  success: boolean;
  error?: string;
  userId?: string;
  roomStatus?: 'active' | 'scheduled' | 'closed';
  scheduledAt?: string;
}> {
  const { name, email, password, country, mobile, defaultLanguage, photoURL } = payload;
  const lowerCaseEmail = email.toLowerCase();
  
  console.log('[signUpUser] Initiated for email:', lowerCaseEmail);
  if (referralId) {
    console.log('[signUpUser] Referral ID provided:', referralId);
  }

  try {
    const settings = await getAppSettingsAction();
    const signupBonus = settings.signupBonus || 100;
    const referralBonus = settings.referralBonus || 150;
    const freeLanguages = await getFreeLanguagePacks();
    console.log('[signUpUser] Settings loaded. Signup bonus:', signupBonus, 'Referral bonus:', referralBonus);


    // --- Step 1: Create User in Firebase Auth ---
    // This must happen first to get a UID.
    console.log('[signUpUser] Creating user in Firebase Auth...');
    const userRecord = await auth.createUser({
        email: lowerCaseEmail,
        password: password,
        displayName: name,
        photoURL: photoURL
    });
    const uid = userRecord.uid;
    console.log('[signUpUser] User created successfully in Auth. UID:', uid);


    // --- Step 2: Perform all database writes in an atomic batch ---
    const batch = db.batch();
    console.log('[signUpUser] Firestore batch created.');

    // 2a. Create the new user's profile in Firestore
    const newUserRef = db.collection('users').doc(uid);
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
        downloadedPhraseCount: 0,
    };
    batch.set(newUserRef, newUserProfile);
    console.log('[signUpUser] Added new user profile creation to batch.');

    // 2b. Log the signup bonus for the new user
    const newUserLogRef = newUserRef.collection('transactionLogs').doc();
    batch.set(newUserLogRef, {
        actionType: 'signup_bonus',
        tokenChange: signupBonus,
        timestamp: FieldValue.serverTimestamp(),
        description: 'Welcome bonus for signing up.',
    });
    console.log('[signUpUser] Added signup bonus transaction log to batch.');

    // 2c. Handle the referral if one exists
    if (referralId) {
        console.log('[signUpUser] Processing referral...');
        const referrerRef = db.collection('users').doc(referralId);
        const referrerDoc = await referrerRef.get();

        if (referrerDoc.exists) {
            console.log('[signUpUser] Referrer found. Preparing batch operations.');
            
            // Create a record in the new 'referrals' collection
            const referralRecordRef = db.collection('referrals').doc();
            batch.set(referralRecordRef, {
                referrerId: referralId,
                referredUserId: uid,
                referredUserName: name,
                referredUserEmail: lowerCaseEmail,
                createdAt: FieldValue.serverTimestamp(),
            });
            console.log('[signUpUser] Added new document to "referrals" collection to batch.');

            // Credit the referrer's account with the bonus
            batch.update(referrerRef, { tokenBalance: FieldValue.increment(referralBonus) });
            console.log(`[signUpUser] Added referrer token balance update (+${referralBonus}) to batch.`);


            // Log the referral bonus for the referrer
            const referrerLogRef = referrerRef.collection('transactionLogs').doc();
            batch.set(referrerLogRef, {
                actionType: 'referral_bonus',
                tokenChange: referralBonus,
                timestamp: FieldValue.serverTimestamp(),
                description: `Bonus for referring new user: ${lowerCaseEmail}`,
            });
            console.log('[signUpUser] Added referrer transaction log to batch.');
            
            // Create a notification for the referrer
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
            console.log('[signUpUser] Added referral notification to batch.');
        } else {
             console.warn('[signUpUser] Referrer document with ID', referralId, 'does not exist. Skipping referral bonus.');
        }
    }

    // --- Step 3: Commit the batch ---
    console.log('[signUpUser] Committing batch...');
    await batch.commit();
    console.log('[signUpUser] Batch committed successfully.');
    
    // --- Step 4: Handle Room Logic (if applicable) ---
    if (roomId) {
        console.log('[signUpUser] Room ID provided:', roomId, '. Checking room status...');
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();
        if (roomDoc.exists) {
            const roomData = roomDoc.data() as SyncRoom;
            console.log('[signUpUser] Room found. Status:', roomData.status);
            
            // Return room status to the client for intelligent redirection
            return { 
                success: true, 
                userId: uid, 
                roomStatus: roomData.status,
                scheduledAt: (roomData.scheduledAt as Timestamp)?.toDate().toISOString()
            };
        } else {
             console.log('[signUpUser] Room with ID', roomId, 'not found.');
        }
    }

    return { success: true, userId: uid };

  } catch (error: any) {
    console.error("[signUpUser] CRITICAL ERROR during user signup:", error);
    // Provide a user-friendly error message
    if (error.code === 'auth/email-already-exists') {
      return { success: false, error: 'This email address is already in use by another account.' };
    }
    return { success: false, error: error.message || 'An unexpected server error occurred.' };
  }
}
