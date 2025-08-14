
'use server';

import { auth, db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';
import { getFreeLanguagePacks } from './audiopack-admin';
import type { SyncRoom, Vibe } from '@/lib/types';
import type { UserRecord } from 'firebase-admin/auth';

interface SignUpPayload {
  uid?: string; // Optional UID for external providers like Google
  name: string;
  email: string;
  password?: string; // Optional for Google Sign-In
  country?: string;
  mobile?: string;
  defaultLanguage?: string;
  photoURL?: string;
}

/**
 * Creates a new user profile in Firestore.
 * This function now handles both password-based signups (creating an Auth user)
 * and external provider signups (using an existing Auth user).
 * It also handles referral bonuses and post-signup room/vibe logic.
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
  roomStatus?: 'active' | 'scheduled' | 'closed';
  scheduledAt?: string;
  roomTopic?: string;
  isNewUser: boolean;
}> {
  const { uid: providedUid, name, email, password, country, mobile, defaultLanguage, photoURL } = payload;
  const lowerCaseEmail = email.toLowerCase();
  
  console.log('[signUpUser] Initiated for email:', lowerCaseEmail);

  try {
    // --- Step 1: Check if user already has a Firestore profile ---
    let userRecord: UserRecord;
    let existingProfile = null;
    
    // If a UID is provided (from Google Sign-In), use it. Otherwise, look up by email for password signups.
    if (providedUid) {
        userRecord = await auth.getUser(providedUid);
        const userProfileDoc = await db.collection('users').doc(providedUid).get();
        if (userProfileDoc.exists) {
            existingProfile = userProfileDoc;
        }
    } else {
        // This path is for email/password signup.
        userRecord = await auth.createUser({
            email: lowerCaseEmail,
            password: password,
            displayName: name,
            photoURL: photoURL
        });
    }

    if (existingProfile) {
        console.log(`[signUpUser] Profile already exists for UID: ${existingProfile.id}. Skipping profile creation.`);
        // Even if the profile exists, we might need to handle room joining logic.
        // The rest of the function (room/vibe checks) will run after this block.
        // Return isNewUser: false so client knows not to expect bonuses etc.
    } else {
        console.log(`[signUpUser] New user. Creating profile for UID: ${userRecord.uid}`);
        // --- Step 2: Fetch all necessary settings and data for a NEW user ---
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

        // --- Step 3: Perform all database writes in a single atomic batch ---
        const batch = db.batch();
        const newUserRef = db.collection('users').doc(userRecord.uid);
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

        const newUserLogRef = newUserRef.collection('transactionLogs').doc();
        batch.set(newUserLogRef, {
            actionType: 'signup_bonus',
            tokenChange: signupBonus,
            timestamp: FieldValue.serverTimestamp(),
            description: 'Welcome bonus for signing up.',
        });

        if (referralId && referrerDoc && referrerDoc.exists) {
            const referrerRef = referrerDoc.ref;
            const referralRecordRef = db.collection('referrals').doc();
            batch.set(referralRecordRef, {
                referrerId: referralId,
                referredUserId: userRecord.uid,
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
            batch.delete(invitationSnapshot.docs[0].ref);
        }

        // --- Step 4: Commit the batch ---
        await batch.commit();
        console.log('[signUpUser] New user batch committed successfully.');
    }
    
    // --- Step 5: Handle Post-Signup Logic (Room or Vibe) for both new and existing users ---
    const finalUserId = existingProfile ? existingProfile.id : userRecord.uid;

    // If joining a Vibe, add user to the invited list to ensure permissions
    if (vibeId) {
        const vibeRef = db.collection('vibes').doc(vibeId);
        // Use an update call which is idempotent and won't fail if the user is already there.
        await vibeRef.update({
            invitedEmails: FieldValue.arrayUnion(lowerCaseEmail)
        }).catch(e => console.warn(`Could not add user to Vibe ${vibeId}, they may already be a member. Error: ${e.message}`));
        console.log(`[signUpUser] Ensured ${lowerCaseEmail} is on invited list for Vibe ${vibeId}`);
    }

    if (roomId) {
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();
        if (roomDoc.exists) {
            const roomData = roomDoc.data() as SyncRoom;
            return { 
                success: true, 
                userId: finalUserId, 
                isNewUser: !existingProfile,
                roomStatus: roomData.status,
                roomTopic: roomData.topic,
                scheduledAt: (roomData.scheduledAt as Timestamp)?.toDate().toISOString()
            };
        }
    }
    
    return { success: true, userId: finalUserId, isNewUser: !existingProfile };

  } catch (error: any) {
    console.error("[signUpUser] CRITICAL ERROR during user signup:", error);
    if (error.code === 'auth/email-already-exists') {
      return { success: false, error: 'This email address is already in use by another account.', isNewUser: false };
    }
    return { success: false, error: error.message || 'An unexpected server error occurred.', isNewUser: false };
  }
}
