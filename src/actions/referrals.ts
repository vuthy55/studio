
'use server';

import { db } from '@/lib/firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';

export interface ReferredUser {
    id: string; // This will now be the referral document ID, not the user ID
    name: string | null;
    email: string;
    createdAt: string; // ISO string
}

/**
 * Fetches users who were referred by a specific user by querying the dedicated 'referrals' collection.
 * @param {string} referrerId - The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A list of users referred by the given user.
 */
export async function getReferredUsers(referrerId: string): Promise<ReferredUser[]> {
    if (!referrerId) {
        return [];
    }

    try {
        const referralsRef = db.collection('referrals');
        // This query now targets the dedicated, indexed 'referrals' collection
        const q = referralsRef.where('referrerId', '==', referrerId).orderBy('createdAt', 'desc');
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            return [];
        }

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            
            // Safely convert Firestore Timestamp to an ISO string
            const createdAt = (data.createdAt as Timestamp)?.toDate()?.toISOString() || new Date(0).toISOString();
            
            const referredUser: ReferredUser = {
                id: doc.id, // The ID of the referral document itself
                name: data.referredUserName || null,
                email: data.referredUserEmail,
                createdAt: createdAt,
            };
            return referredUser;
        });
        
        return results;

    } catch (error) {
        console.error(`CRITICAL ERROR fetching referrals for ${referrerId}:`, error);
        // Return empty array on error to prevent client crashes
        return [];
    }
}
