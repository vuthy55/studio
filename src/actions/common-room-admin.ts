
'use server';

import { db } from '@/lib/firebase-admin';
import type { Report } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';

/**
 * Fetches all vibes from Firestore for the admin dashboard, bypassing security rules.
 */
export async function getAllVibesAdmin(): Promise<any[]> {
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

            return sanitizedData;
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
    id: string; // Ensure ID is part of the client type
    reportedAt: string; // ISO string
};

export async function getReports(): Promise<ClientReport[]> {
    try {
        const snapshot = await db.collection('reports')
            .where('status', '==', 'pending')
            .get();
        
        if (snapshot.empty) {
            return [];
        }

        const reports = snapshot.docs.map(doc => {
            const data = doc.data() as Report;
            return {
                ...data,
                id: doc.id,
                reportedAt: (data.reportedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString()
            }
        });
        
        // Sorting is now done on the client-side
        return reports.sort((a,b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
}

async function notifyReporter(reporterId: string, vibeTopic: string, actionTaken: 'dismissed' | 'content_removed') {
    if (!reporterId) return;

    const message = actionTaken === 'dismissed'
        ? `Your report concerning the Vibe "${vibeTopic}" has been reviewed and closed. No action was taken.`
        : `Thank you for your report on the Vibe "${vibeTopic}". We have reviewed it and taken appropriate action.`;
    
    await db.collection('notifications').add({
        userId: reporterId,
        type: 'report_resolved',
        message,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
    });
}

export async function dismissReport(report: ClientReport): Promise<{success: boolean, error?: string}> {
    try {
        const reportRef = db.collection('reports').doc(report.id);
        await reportRef.update({ status: 'dismissed', adminNotes: 'Dismissed by admin.' });
        
        await notifyReporter(report.reporter.uid, report.vibeTopic, 'dismissed');

        return { success: true };
    } catch (error: any) {
        return { success: false, error: 'Failed to dismiss report.' };
    }
}


interface ResolvePayload {
    report: ClientReport;
    adminNotes: string;
}

export async function resolveReportAndDeleteContent({ report, adminNotes }: ResolvePayload): Promise<{success: boolean, error?: string}> {
     try {
        const { id: reportId, contentType, contentId, vibeId, vibeTopic, reporter } = report;
        const batch = db.batch();
        
        const reportRef = db.collection('reports').doc(reportId);
        batch.update(reportRef, { status: 'resolved', adminNotes });

        if (contentType === 'vibe') {
            const vibeRef = db.collection('vibes').doc(vibeId);
            await deleteCollection(`vibes/${vibeId}/posts`, 100);
            await deleteCollection(`vibes/${vibeId}/parties`, 100);
            batch.delete(vibeRef);
        } else { // It's a post
            const postRef = db.collection('vibes').doc(vibeId).collection('posts').doc(contentId);
            batch.delete(postRef);
            
            const vibeRef = db.collection('vibes').doc(vibeId);
            batch.update(vibeRef, { postsCount: FieldValue.increment(-1) });
        }
        
        await batch.commit();
        
        await notifyReporter(reporter.uid, vibeTopic, 'content_removed');

        return { success: true };
    } catch (error: any) {
        console.error("Error resolving report:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
