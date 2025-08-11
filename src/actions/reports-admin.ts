
'use server';

import { db } from '@/lib/firebase-admin';
import type { Report, ClientReport } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';

/**
 * Fetches all reports from Firestore for the admin dashboard.
 * Converts Timestamps to strings for client-side serialization.
 */
export async function getReportsAdmin(): Promise<ClientReport[]> {
    try {
        const snapshot = await db.collection('reports').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) return [];

        return snapshot.docs.map(doc => {
            const data = doc.data() as Report; // Treat data as the server-side type
            return { 
                ...data,
                id: doc.id,
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(), // Convert to string
             } as ClientReport;
        });

    } catch (error) {
        console.error("[Admin Action] Error fetching reports:", error);
        return [];
    }
}


interface ResolveReportPayload {
    reportId: string;
    vibeId: string;
    resolution: 'dismiss' | 'archive';
}

/**
 * Resolves a report by either dismissing it or archiving the associated Vibe.
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
        } else if (resolution === 'archive') {
            batch.update(vibeRef, { status: 'archived' }); // Soft delete
            batch.update(reportRef, { status: 'resolved' });
        }

        const notificationType: NotificationType = 'report_resolved';
        const baseMessage = `The report for Vibe "${reportData.vibeTopic}" has been reviewed.`;
        const reporterMessage = `${baseMessage} ${resolution === 'dismiss' ? 'No violations were found.' : 'Appropriate action has been taken.'}`;
        const creatorMessage = `${baseMessage} ${resolution === 'dismiss' ? 'Your Vibe has been reinstated.' : 'Your Vibe was found to be in violation of community guidelines and has been archived.'}`;

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
