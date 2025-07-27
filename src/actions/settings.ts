
'use server';

import { db } from '@/lib/firebase-admin';

export interface AppSettings {
  signupBonus: number;
  referralBonus: number;
  practiceReward: number;
  practiceThreshold: number;
  freeSyncLiveMinutes: number;
  translationCost: number;
  costPerSyncLiveMinute: number;
  maxUsersPerRoom: number;
  freeSyncOnlineMinutes: number;
  costPerSyncOnlineMinute: number;
  summaryTranslationCost: number;
  transcriptCost: number;
  languagePackCost: number;
}

const settingsDocRef = db.collection('settings').doc('appConfig');

/**
 * Fetches application settings using the Firebase Admin SDK.
 * This is a secure server-side operation.
 */
export async function getAppSettingsAction(): Promise<AppSettings> {
    const defaultSettings: AppSettings = {
        signupBonus: 100,
        referralBonus: 150,
        practiceReward: 1,
        practiceThreshold: 3,
        freeSyncLiveMinutes: 10,
        translationCost: 1,
        costPerSyncLiveMinute: 2,
        maxUsersPerRoom: 5,
        freeSyncOnlineMinutes: 10,
        costPerSyncOnlineMinute: 2,
        summaryTranslationCost: 10,
        transcriptCost: 50,
        languagePackCost: 10,
    };
    
    try {
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) {
            return { ...defaultSettings, ...docSnap.data() } as AppSettings;
        } else {
            // If settings don't exist, create them with defaults
            await settingsDocRef.set(defaultSettings);
            return defaultSettings;
        }
    } catch (error) {
        console.error("Admin SDK: Error fetching app settings:", error);
        // Fallback to in-memory defaults on error
        return defaultSettings;
    }
}

/**
 * Updates application settings using the Firebase Admin SDK.
 * This is a secure server-side operation.
 * @param {Partial<AppSettings>} newSettings - The settings to update.
 */
export async function updateAppSettingsAction(newSettings: Partial<AppSettings>): Promise<{success: boolean, error?: string}> {
    try {
        if (!newSettings || Object.keys(newSettings).length === 0) {
            return { success: false, error: 'No settings provided to update.' };
        }
        
        // Basic validation: ensure all values are numbers
        for (const key in newSettings) {
            if (typeof (newSettings as any)[key] !== 'number') {
                 return { success: false, error: `Invalid value for ${key}. All settings must be numbers.`};
            }
        }

        await settingsDocRef.set(newSettings, { merge: true });
        return { success: true };

    } catch (error: any) {
        console.error("Admin SDK: Error updating app settings:", error);
        return { success: false, error: 'Failed to update settings on the server.' };
    }
}
