
'use server';

import { db } from '@/lib/firebase-admin';
import type { ClientVibe, Report } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';

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


export type ClientReport = Omit<Report, 'reportedAt'> & {
    reportedAt: string; // ISO string
};

export async function getReports(): Promise<ClientReport[]> {
    try {
        const snapshot = await db.collection('reports')
            .where('status', '==', 'pending')
            .orderBy('reportedAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            return [];
        }

        return snapshot.docs.map(doc => {
            const data = doc.data() as Report;
            return {
                ...data,
                id: doc.id,
                reportedAt: (data.reportedAt as Timestamp).toDate().toISOString()
            }
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
}

export async function dismissReport(reportId: string): Promise<{success: boolean, error?: string}> {
    try {
        await db.collection('reports').doc(reportId).update({ status: 'dismissed' });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: 'Failed to dismiss report.' };
    }
}


interface ResolvePayload {
    reportId: string;
    contentType: 'post' | 'vibe';
    contentId: string;
    vibeId: string;
}

export async function resolveReportAndDeleteContent(payload: ResolvePayload): Promise<{success: boolean, error?: string}> {
     try {
        const { reportId, contentType, contentId, vibeId } = payload;
        const batch = db.batch();
        
        // Mark the report as resolved
        const reportRef = db.collection('reports').doc(reportId);
        batch.update(reportRef, { status: 'resolved' });

        if (contentType === 'vibe') {
            await deleteVibesAdmin([vibeId]); // Use existing robust deletion logic
        } else { // It's a post
            const postRef = db.collection('vibes').doc(vibeId).collection('posts').doc(contentId);
            batch.delete(postRef);

            // Decrement post count
            const vibeRef = db.collection('vibes').doc(vibeId);
            batch.update(vibeRef, { postsCount: FieldValue.increment(-1) });
        }
        
        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error("Error resolving report:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
