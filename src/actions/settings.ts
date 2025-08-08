
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
  liveTranslationSavePhraseCost: z.number().default(1),
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
  storyPageImage1: z.string().url().optional().default('https://images.unsplash.com/photo-1534323382794-4b5b34149e91?q=80&w=2070&auto=format&fit=crop').describe('Image 1 (Backpacker). Recommended 3:2 aspect ratio (e.g., 600x400).'),
  storyPageImage2: z.string().url().optional().default('https://images.unsplash.com/photo-1574068468668-a05a11f871da?q=80&w=1974&auto=format&fit=crop').describe('Image 2 (Ordering Food). Recommended 3:2 aspect ratio (e.g., 600x400).'),
  storyPageImage3: z.string().url().optional().default('https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop').describe('Image 3 (Diverse Friends). Recommended 3:2 aspect ratio (e.g., 600x400).'),
  storyPageImage4: z.string().url().optional().default('https://images.unsplash.com/photo-1516589178581-6e3a4f11413a?q=80&w=2070&auto=format&fit=crop').describe('Image 4 (Friends with Phone). Recommended 3:2 aspect ratio (e.g., 600x400).'),
});

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
    liveTranslationSavePhraseCost: 1,
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
    storyPageImage1: 'https://images.unsplash.com/photo-1534323382794-4b5b34149e91?q=80&w=2070&auto=format&fit=crop',
    storyPageImage2: 'https://images.unsplash.com/photo-1574068468668-a05a11f871da?q=80&w=1974&auto=format&fit=crop',
    storyPageImage3: 'https://images.unsplash.com/photo-1542037104-91ad67d9692a?q=80&w=1974&auto=format&fit=crop',
    storyPageImage4: 'https://images.unsplash.com/photo-1516589178581-6e3a4f11413a?q=80&w=2070&auto=format&fit=crop',
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
    
    const validationSchema = AppSettingsSchema.partial();
    const parsedSettings = validationSchema.safeParse(newSettings);

    if (!parsedSettings.success) {
      // Return a stringified version of the Zod errors for better debugging.
      return { success: false, error: JSON.stringify(parsedSettings.error.flatten().fieldErrors) };
    }

    await settingsDocRef.set(parsedSettings.data, { merge: true });
    return { success: true };

  } catch (error: any) {
    console.error("Admin SDK: Error updating app settings:", error);
    return { success: false, error: 'Failed to update settings on the server.' };
  }
}
