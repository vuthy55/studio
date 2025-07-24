
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue }from 'firebase-admin/firestore';
import type { LanguageCode } from '@/lib/data';


/**
 * Resets all practice statistics for a specific language for a given user.
 * This action removes the language-specific fields from all documents in the
 * user's 'practiceHistory' subcollection. It does not affect earned tokens.
 *
 * @param {string} userId - The ID of the user whose stats are to be reset.
 * @param {LanguageCode} languageCode - The code of the language to reset (e.g., 'thai').
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function resetLanguageStats(userId: string, languageCode: LanguageCode): Promise<{success: boolean, error?: string}> {
    if (!userId || !languageCode) {
        return { success: false, error: 'User ID and language code are required.' };
    }

    try {
        const historyRef = db.collection('users').doc(userId).collection('practiceHistory');
        const snapshot = await historyRef.get();

        if (snapshot.empty) {
            return { success: true }; // Nothing to reset
        }

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            const updateData: Record<string, FieldValue> = {};
            
            // Use FieldValue.delete() to remove a specific key from a map field.
            updateData[`passCountPerLang.${languageCode}`] = FieldValue.delete();
            updateData[`failCountPerLang.${languageCode}`] = FieldValue.delete();
            updateData[`lastAccuracyPerLang.${languageCode}`] = FieldValue.delete();
            updateData[`lastAttemptPerLang.${languageCode}`] = FieldValue.delete();

            batch.update(doc.ref, updateData);
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error(`Error resetting stats for user ${userId}, language ${languageCode}:`, error);
        return { success: false, error: 'An unexpected server error occurred while resetting stats.' };
    }
}
