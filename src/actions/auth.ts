
'use server';

import { auth, db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';
import { getFreeLanguagePacks } from './audiopack-admin';
import type { SyncRoom, Vibe } from '@/lib/types';

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
  if (referralId) {
    console.log('[signUpUser] Referral ID provided:', referralId);
  }

  try {
    // --- Step 1: Fetch all necessary settings and data first ---
    console.log('[signUpUser] Step 1: Fetching settings and checking referrer...');
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
        } else {
            console.log('[signUpUser] Referrer found:', referrerDoc.data()?.email);
        }
    }


    // --- Step 2: Create User in Firebase Auth ---
    // This must happen first to get a UID for all subsequent database operations.
    console.log('[signUpUser] Step 2: Creating user in Firebase Auth...');
    const userRecord = await auth.createUser({
        email: lowerCaseEmail,
        password: password, // Password is optional and will be undefined for Google Sign-In
        displayName: name,
        photoURL: photoURL
    });
    const uid = userRecord.uid;
    console.log('[signUpUser] User created successfully in Auth. UID:', uid);


    // --- Step 3: Perform all database writes in a single atomic batch ---
    console.log('[signUpUser] Step 3: Creating atomic database batch...');
    const batch = db.batch();

    // 3a. Create the new user's profile in Firestore
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
        downloadedPacks: freeLanguages,
        downloadedPhraseCount: 0,
    };
    batch.set(newUserRef, newUserProfile);
    console.log('[signUpUser] Added new user profile creation to batch.');

    // 3b. Log the signup bonus for the new user
    const newUserLogRef = newUserRef.collection('transactionLogs').doc();
    batch.set(newUserLogRef, {
        actionType: 'signup_bonus',
        tokenChange: signupBonus,
        timestamp: FieldValue.serverTimestamp(),
        description: 'Welcome bonus for signing up.',
    });
    console.log('[signUpUser] Added signup bonus transaction log to batch.');

    // 3c. Handle the referral if the referrer was found
    if (referralId && referrerDoc && referrerDoc.exists) {
        console.log('[signUpUser] Processing valid referral...');
        const referrerRef = referrerDoc.ref;
        
        // Create a record in the 'referrals' collection
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
    } else if (referralId) {
        console.log('[signUpUser] Skipping referral operations because referrer document was not found.');
    }
    
    // 3d. Check for and delete a pending invitation for this email
    const invitationsRef = db.collection('invitations');
    const q = invitationsRef.where('invitedEmail', '==', lowerCaseEmail).limit(1);
    const invitationSnapshot = await q.get();

    if (!invitationSnapshot.empty) {
        const invitationDoc = invitationSnapshot.docs[0];
        console.log(`[signUpUser] Deleting pending invitation document ${invitationDoc.id}`);
        batch.delete(invitationDoc.ref);
    }
    
    // 3e. If joining a Vibe, add user to the invited list to ensure permissions
    if (vibeId) {
        const vibeRef = db.collection('vibes').doc(vibeId);
        batch.update(vibeRef, {
            invitedEmails: FieldValue.arrayUnion(lowerCaseEmail)
        });
        console.log(`[signUpUser] Added ${lowerCaseEmail} to invited list for Vibe ${vibeId}`);
    }

    // --- Step 4: Commit the entire batch ---
    console.log('[signUpUser] Step 4: Committing batch to Firestore...');
    await batch.commit();
    console.log('[signUpUser] Batch committed successfully.');
    
    // --- Step 5: Handle Post-Signup Logic (Room or Vibe) ---
    if (roomId) {
        console.log('[signUpUser] Step 5: Room ID provided. Checking room status...');
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
                roomTopic: roomData.topic,
                scheduledAt: (roomData.scheduledAt as Timestamp)?.toDate().toISOString()
            };
        } else {
             console.log('[signUpUser] Room with ID', roomId, 'not found.');
        }
    }
    
    if (vibeId) {
        console.log('[signUpUser] Step 5: Vibe ID provided. Client will handle redirect.');
        return { success: true, userId: uid };
    }


    console.log('[signUpUser] Process completed successfully.');
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
