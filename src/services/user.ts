
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface UserProfile {
  name: string;
  email: string;
  country?: string;
  mobile?: string;
}

export interface UpdateUserProfileInput {
  userId: string;
  data: Partial<UserProfile>;
}

/**
 * Fetches a user's profile from Firestore.
 * @param userId - The UID of the user.
 * @returns The user profile data, or null if not found.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  console.log('--- DEBUG: [Service] getUserProfile called with userId:', userId);
  if (!userId) {
    console.error('--- DEBUG: [Service] getUserProfile called with null or undefined userId.');
    return null;
  }
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      console.log('--- DEBUG: [Service] Profile found for', userId);
      return userDocSnap.data() as UserProfile;
    } else {
      console.log('--- DEBUG: [Service] No profile document found for', userId);
      return null;
    }
  } catch (error) {
    console.error("--- DEBUG: [Service] Full error in getUserProfile:", error);
    throw new Error('Could not fetch user profile.');
  }
}

/**
 * Creates or updates a user's profile in Firestore.
 * Using setDoc with merge: true allows this function to both create a new
 * document or update an existing one without overwriting the whole document.
 * @param input - The user ID and the data to update.
 */
export async function updateUserProfile(input: UpdateUserProfileInput): Promise<void> {
  const { userId, data } = input;
  console.log('--- DEBUG: [Service] updateUserProfile called for userId:', userId, 'with data:', data);
  if (!userId) {
    console.error('--- DEBUG: [Service] updateUserProfile called with null or undefined userId.');
    return;
  }
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, data, { merge: true });
    console.log('--- DEBUG: [Service] Successfully updated profile for', userId);
  } catch (error) {
    console.error("--- DEBUG: [Service] Full error in updateUserProfile:", error);
    throw new Error('Could not update user profile.');
  }
}
