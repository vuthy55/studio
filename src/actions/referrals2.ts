
'use server';

import { db } from '@/lib/firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';

export interface ReferredUser {
    id: string; 
    name: string | null;
    email: string;
    createdAt: string; // ISO string
}

/**
 * Fetches users who were referred by a specific user by querying the dedicated 'referrals' collection.
 * @param {string} referrerId - The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A list of users referred by the given user.
 */
export async function getReferredUsers2(referrerId: string): Promise<ReferredUser[]> {
    if (!referrerId) {
        return [];
    }

    try {
        const referralsRef = db.collection('referrals');
        const q = referralsRef.where('referrerId', '==', referrerId).orderBy('createdAt', 'desc');
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            return [];
        }

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            
            const createdAt = (data.createdAt as Timestamp)?.toDate()?.toISOString() || new Date(0).toISOString();
            
            const referredUser: ReferredUser = {
                id: doc.id,
                name: data.referredUserName || null,
                email: data.referredUserEmail,
                createdAt: createdAt,
            };
            return referredUser;
        });
        
        return results;

    } catch (error) {
        console.error(`CRITICAL ERROR fetching referrals for ${referrerId}:`, error);
        return [];
    }
}
