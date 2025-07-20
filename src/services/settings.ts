import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AppSettings {
  signupBonus: number;
  practiceReward: number;
  practiceThreshold: number;
  translationCost: number;
}

const defaultSettings: AppSettings = {
  signupBonus: 100,
  practiceReward: 1,
  practiceThreshold: 3,
  translationCost: 1,
};

const settingsDocRef = doc(db, 'settings', 'appConfig');

/**
 * Fetches the application settings from Firestore.
 * If no settings document exists, it returns and creates the default settings.
 * @returns {Promise<AppSettings>} The application settings.
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      // Merge with defaults to ensure all keys are present
      return { ...defaultSettings, ...docSnap.data() } as AppSettings;
    } else {
      // If the document doesn't exist, create it with default values
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
 * @param {Partial<AppSettings>} newSettings The settings to update.
 * @returns {Promise<void>}
 */
export async function updateAppSettings(newSettings: Partial<AppSettings>): Promise<void> {
  await setDoc(settingsDocRef, newSettings, { merge: true });
}
