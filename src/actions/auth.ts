'use server';

import { auth, db } from '@/lib/firebase-admin';
import { FieldValue, writeBatch } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';

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
 * This is a secure server-side action.
 */
export async function signUpUser(
  payload: SignUpPayload,
  referralId: string | null
): Promise<{ success: boolean; error?: string; userId?: string }> {
  const { name, email, password, country, mobile, defaultLanguage, photoURL } = payload;
  const lowerCaseEmail = email.toLowerCase();

  try {
    const settings = await getAppSettingsAction();
    const signupBonus = settings.signupBonus || 100;
    const referralBonus = settings.referralBonus || 150;

    // --- Step 1: Create User in Firebase Auth ---
    // This must happen first to get a UID.
    const userRecord = await auth.createUser({
        email: lowerCaseEmail,
        password: password,
        displayName: name,
        photoURL: photoURL
    });
    const uid = userRecord.uid;


    // --- Step 2: Perform all database writes in an atomic batch ---
    const batch = db.batch();

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
        photoURL: photoURL || null
    };

    // 2b. Log the signup bonus for the new user
    const newUserLogRef = newUserRef.collection('transactionLogs').doc();
    batch.set(newUserLogRef, {
        actionType: 'signup_bonus',
        tokenChange: signupBonus,
        timestamp: FieldValue.serverTimestamp(),
        description: 'Welcome bonus for signing up.',
    });

    // 2c. Handle the referral if one exists
    if (referralId) {
        const referrerRef = db.collection('users').doc(referralId);
        const referrerDoc = await referrerRef.get();

        if (referrerDoc.exists) {
            // Add the referrer's ID to the new user's profile
            newUserProfile.referredBy = referralId;
            
            // Credit the referrer's account with the bonus
            batch.update(referrerRef, { tokenBalance: FieldValue.increment(referralBonus) });

            // Log the referral bonus for the referrer
            const referrerLogRef = referrerRef.collection('transactionLogs').doc();
            batch.set(referrerLogRef, {
                actionType: 'referral_bonus',
                tokenChange: referralBonus,
                timestamp: FieldValue.serverTimestamp(),
                description: `Bonus for referring new user: ${lowerCaseEmail}`,
            });
            
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
        }
    }
    
    // Set the new user profile data (including referral info if any)
    batch.set(newUserRef, newUserProfile);

    // --- Step 3: Commit the batch ---
    await batch.commit();

    return { success: true, userId: uid };

  } catch (error: any) {
    console.error("Error in signUpUser action:", error);
    // Provide a user-friendly error message
    if (error.code === 'auth/email-already-exists') {
      return { success: false, error: 'This email address is already in use by another account.' };
    }
    return { success: false, error: error.message || 'An unexpected server error occurred.' };
  }
}
