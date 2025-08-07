
'use server';

import { db } from '@/lib/firebase-admin';
import type { ClientVibe } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';
import { getAppSettingsAction } from './settings';

/**
 * Fetches all vibes from Firestore for the admin dashboard, bypassing security rules.
 */
export async function getAllVibesAdmin(): Promise<ClientVibe[]> {
    try {
        const snapshot = await db.collection('vibes').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            return [];
        }

        const vibes = snapshot.docs.map(doc => {
            const data = doc.data();
            const sanitizedData: { [key: string]: any } = { id: doc.id };
            
            // Convert any Timestamp objects to ISO strings to prevent serialization errors.
            for (const key in data) {
                const value = data[key];
                if (value instanceof Timestamp) {
                    sanitizedData[key] = value.toDate().toISOString();
                } else {
                    sanitizedData[key] = value;
                }
            }

            return sanitizedData as ClientVibe;
        });
        
        return vibes;

    } catch (error) {
        console.error("[Admin Action] Error fetching all vibes:", error);
        return [];
    }
}


/**
 * Deletes specified vibes and their subcollections (posts, parties).
 * @param {string[]} vibeIds An array of vibe IDs to delete.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function deleteVibesAdmin(vibeIds: string[]): Promise<{success: boolean, error?: string}> {
    if (!vibeIds || vibeIds.length === 0) {
        return { success: false, error: "No vibe IDs provided." };
    }

    try {
        const batch = db.batch();
        for (const vibeId of vibeIds) {
            
            // Delete subcollections first
            await deleteCollection(`vibes/${vibeId}/posts`, 50);
            await deleteCollection(`vibes/${vibeId}/parties`, 50);

            // Then delete the main vibe document
            const vibeDocRef = db.collection('vibes').doc(vibeId);
            batch.delete(vibeDocRef);
        }
        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error deleting vibes:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


/**
 * Fetches only vibes that are considered "archived" based on inactivity settings.
 */
export async function getArchivedVibesAdmin(): Promise<ClientVibe[]> {
    try {
        const settings = await getAppSettingsAction();
        const inactivityDays = settings.vibeInactivityDays || 10;
        const archiveThreshold = new Date();
        archiveThreshold.setDate(archiveThreshold.getDate() - inactivityDays);
        
        const archiveTimestamp = Timestamp.fromDate(archiveThreshold);

        const snapshot = await db.collection('vibes')
                                 .where('lastPostAt', '<', archiveTimestamp)
                                 .orderBy('lastPostAt', 'desc')
                                 .get();

        if (snapshot.empty) {
            return [];
        }
        
        const vibes = snapshot.docs.map(doc => {
            const data = doc.data();
             const sanitizedData: { [key: string]: any } = { id: doc.id };
            
            for (const key in data) {
                const value = data[key];
                if (value instanceof Timestamp) {
                    sanitizedData[key] = value.toDate().toISOString();
                } else {
                    sanitizedData[key] = value;
                }
            }

            return sanitizedData as ClientVibe;
        });

        return vibes;

    } catch (error) {
        console.error("[Admin Action] Error fetching archived vibes:", error);
        return [];
    }
}
