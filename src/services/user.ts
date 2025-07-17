
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
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting user profile: ", error);
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
  try {
    const userDocRef = doc(db, 'users', userId);
    // Use setDoc with merge: true. This will create the document if it doesn't exist,
    // and update the fields specified in `data` if it does exist, without
    // overwriting the entire document. This is the correct, idempotent way to handle this.
    await setDoc(userDocRef, data, { merge: true });
  } catch (error) {
    console.error("Error updating user profile: ", error);
    throw new Error('Could not update user profile.');
  }
}
