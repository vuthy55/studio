
'use server';

import { db } from '@/lib/firebase-admin';
import type { Report, NotificationType } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';

/**
 * Fetches all reports from Firestore for the admin dashboard.
 */
export async function getReportsAdmin(): Promise<Report[]> {
    try {
        const snapshot = await db.collection('reports').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) return [];

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
             } as Report;
        });

    } catch (error) {
        console.error("[Admin Action] Error fetching reports:", error);
        return [];
    }
}


interface ResolveReportPayload {
    reportId: string;
    vibeId: string;
    resolution: 'dismiss' | 'delete';
}

/**
 * Resolves a report by either dismissing it or deleting the associated Vibe.
 * Creates notifications for the reporter and the Vibe creator.
 */
export async function resolveReportAdmin(payload: ResolveReportPayload): Promise<{ success: boolean; error?: string }> {
    const { reportId, vibeId, resolution } = payload;
    if (!reportId || !vibeId || !resolution) {
        return { success: false, error: 'Missing required information.' };
    }

    const reportRef = db.collection('reports').doc(reportId);
    const vibeRef = db.collection('vibes').doc(vibeId);

    try {
        const reportDoc = await reportRef.get();
        if (!reportDoc.exists) {
            return { success: false, error: 'Report not found.' };
        }
        const reportData = reportDoc.data() as Report;
        
        const batch = db.batch();

        if (resolution === 'dismiss') {
            batch.update(vibeRef, { status: FieldValue.delete() }); // Removes the 'under_review' status
            batch.update(reportRef, { status: 'dismissed' });
        } else if (resolution === 'delete') {
            // Subcollections must be deleted before the document itself.
            // This happens outside the batch.
            await deleteCollection(`vibes/${vibeId}/posts`, 100);
            await deleteCollection(`vibes/${vibeId}/parties`, 100);
            batch.delete(vibeRef);
            batch.update(reportRef, { status: 'resolved' });
        }

        const notificationType: NotificationType = 'report_resolved';
        const baseMessage = `The report for Vibe "${reportData.vibeTopic}" has been reviewed.`;
        const reporterMessage = `${baseMessage} ${resolution === 'dismiss' ? 'No violations were found.' : 'Appropriate action has been taken.'}`;
        const creatorMessage = `${baseMessage} ${resolution === 'dismiss' ? 'Your Vibe has been reinstated.' : 'Your Vibe was found to be in violation of community guidelines and has been removed.'}`;

        // Notify Reporter
        const reporterNotificationRef = db.collection('notifications').doc();
        batch.set(reporterNotificationRef, {
            userId: reportData.reporterId,
            type: notificationType,
            message: reporterMessage,
            vibeId: vibeId,
            read: false,
            createdAt: FieldValue.serverTimestamp()
        });

        // Notify Creator
        const creatorNotificationRef = db.collection('notifications').doc();
        batch.set(creatorNotificationRef, {
            userId: reportData.contentAuthorId,
            type: notificationType,
            message: creatorMessage,
            vibeId: vibeId,
            read: false,
            createdAt: FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true };

    } catch (error: any) {
        console.error("Error resolving report:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
