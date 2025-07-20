
'use server';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { adminDb, getCurrentUser } from '@/lib/firebase-admin';

export interface AppSettings {
  signupBonus: number;
  practiceReward: number;
  practiceThreshold: number;
  translationCost: number;
  groupConversationTimeout: number;
}

const defaultSettings: AppSettings = {
  signupBonus: 100,
  practiceReward: 1,
  practiceThreshold: 3,
  translationCost: 1,
  groupConversationTimeout: 30, // Default to 30 seconds
};

const settingsDocRef = doc(db, 'settings', 'appConfig');
const adminSettingsDocRef = doc(adminDb, 'settings', 'appConfig');

/**
 * Fetches the application settings from Firestore.
 * This function is safe for client-side use.
 * @returns {Promise<AppSettings>} The application settings.
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      return { ...defaultSettings, ...docSnap.data() } as AppSettings;
    } else {
      await setDoc(settingsDocRef, defaultSettings);
      return defaultSettings;
    }
  } catch (error) {
    console.error("Error getting app settings, returning defaults:", error);
    return defaultSettings;
  }
}

/**
 * Updates the application settings in Firestore.
 * This is a server action that requires admin privileges.
 * @param {Partial<AppSettings>} newSettings The settings to update.
 * @returns {Promise<void>}
 */
export async function updateAppSettings(newSettings: Partial<AppSettings>): Promise<void> {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error("PERMISSION_DENIED: You must be logged in.");
  }

  const userDocSnap = await adminDb.collection('users').doc(user.uid).get();
  
  if (!userDocSnap.exists || userDocSnap.data()?.role !== 'admin') {
      throw new Error("PERMISSION_DENIED: You must be an admin to perform this action.");
  }
  
  await setDoc(adminSettingsDocRef, newSettings, { merge: true });
}
