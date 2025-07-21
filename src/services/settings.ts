
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
 * Fetches the application settings from Firestore, with client-side caching.
 * @returns {Promise<AppSettings>} The application settings.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const SETTINGS_CACHE_KEY = 'appSettings';
  const TIMESTAMP_CACHE_KEY = 'appSettingsTimestamp';
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Try to get from cache first (client-side only)
  if (typeof window !== 'undefined') {
    const cachedSettings = localStorage.getItem(SETTINGS_CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(TIMESTAMP_CACHE_KEY);

    if (cachedSettings && cachedTimestamp) {
      const isCacheValid = (Date.now() - parseInt(cachedTimestamp, 10)) < CACHE_DURATION_MS;
      if (isCacheValid) {
        return { ...defaultSettings, ...JSON.parse(cachedSettings) };
      }
    }
  }

  // If not in cache or cache is invalid, fetch from Firestore
  try {
    const docSnap = await getDoc(settingsDocRef);
    let settingsToReturn: AppSettings;

    if (docSnap.exists()) {
      settingsToReturn = { ...defaultSettings, ...docSnap.data() } as AppSettings;
    } else {
      await setDoc(settingsDocRef, defaultSettings);
      settingsToReturn = defaultSettings;
    }

    // Save to cache on the client-side
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settingsToReturn));
      localStorage.setItem(TIMESTAMP_CACHE_KEY, Date.now().toString());
    }

    return settingsToReturn;

  } catch (error) {
    console.error("Error getting app settings from Firestore, returning defaults:", error);
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
  // Invalidate cache
   if (typeof window !== 'undefined') {
      localStorage.removeItem('appSettings');
      localStorage.removeItem('appSettingsTimestamp');
    }
}
