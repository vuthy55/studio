
'use server';

import { db } from '@/lib/firebase-admin';
import { z } from 'zod';

const AppSettingsSchema = z.object({
  signupBonus: z.number().default(100),
  referralBonus: z.number().default(150),
  practiceReward: z.number().default(1),
  practiceThreshold: z.number().default(3),
  freeSyncLiveMinutes: z.number().default(10),
  translationCost: z.number().default(1),
  costPerSyncLiveMinute: z.number().default(2),
  maxUsersPerRoom: z.number().default(5),
  freeSyncOnlineMinutes: z.number().default(10),
  costPerSyncOnlineMinute: z.number().default(2),
  summaryTranslationCost: z.number().default(10),
  transcriptCost: z.number().default(50),
  languageUnlockCost: z.number().default(100),
  roomReminderMinutes: z.number().default(5),
  infohubAiCost: z.number().default(10),
  infohubGovernmentAdvisorySources: z.string().default('travel.state.gov, www.gov.uk/foreign-travel-advice, www.smartraveller.gov.au'),
  infohubGlobalNewsSources: z.string().default('www.reuters.com, apnews.com, www.bbc.com/news'),
  vibeInactivityDays: z.number().default(10),
  vibeCommunityRules: z.string().default('1. Be respectful and kind.\n2. No hate speech, harassment, or bullying.\n3. Do not discuss or promote illegal activities, including drugs.\n4. No sexually explicit content.\n5. Keep discussions relevant to travel and culture.'),
}).catchall(z.any()); // Allow dynamic region/local news keys but also any other key

export type AppSettings = z.infer<typeof AppSettingsSchema>;

const settingsDocRef = db.collection('settings').doc('appConfig');

/**
 * Fetches application settings using the Firebase Admin SDK.
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
    languageUnlockCost: 100,
    roomReminderMinutes: 5,
    infohubAiCost: 10,
    infohubGovernmentAdvisorySources: 'travel.state.gov, www.gov.uk/foreign-travel-advice, www.smartraveller.gov.au',
    infohubGlobalNewsSources: 'www.reuters.com, apnews.com, www.bbc.com/news',
    vibeInactivityDays: 10,
    vibeCommunityRules: '1. Be respectful and kind.\n2. No hate speech, harassment, or bullying.\n3. Do not discuss or promote illegal activities, including drugs.\n4. No sexually explicit content.\n5. Keep discussions relevant to travel and culture.',
  };

  try {
    const docSnap = await settingsDocRef.get();
    if (docSnap.exists) {
      // Validate the data from Firestore against the schema, applying defaults if fields are missing.
      const parsed = AppSettingsSchema.safeParse({ ...defaultSettings, ...docSnap.data() });
      if (parsed.success) {
        return parsed.data;
      } else {
        console.error("Firestore settings data is invalid:", parsed.error);
        return defaultSettings;
      }
    } else {
      await settingsDocRef.set(defaultSettings);
      return defaultSettings;
    }
  } catch (error) {
    console.error("Admin SDK: Error fetching app settings:", error);
    return defaultSettings;
  }
}

/**
 * Updates application settings using the Firebase Admin SDK.
 */
export async function updateAppSettingsAction(newSettings: Partial<AppSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    if (!newSettings || Object.keys(newSettings).length === 0) {
      return { success: false, error: 'No settings provided to update.' };
    }
    
    // Use the base schema directly with .partial() to validate all known fields.
    // .catchall(z.any()) will allow any extra fields to pass through without validation,
    // which is needed for dynamic keys from the Intel tab.
    const validationSchema = AppSettingsSchema.partial();
    const parsedSettings = validationSchema.safeParse(newSettings);

    if (!parsedSettings.success) {
      // Return a stringified version of the Zod errors for better debugging.
      return { success: false, error: JSON.stringify(parsedSettings.error.flatten().fieldErrors) };
    }

    // Use the validated (and potentially transformed) data from the parser.
    await settingsDocRef.set(parsedSettings.data, { merge: true });
    return { success: true };

  } catch (error: any) {
    console.error("Admin SDK: Error updating app settings:", error);
    return { success: false, error: 'Failed to update settings on the server.' };
  }
}
