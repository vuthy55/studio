

'use client';

import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';

export interface ReferredUser {
    id: string; 
    name: string | null;
    email: string;
    createdAt: string; // ISO string
}

/**
 * Fetches users who were referred by a specific user by querying the dedicated 'referrals' collection.
 * This is a client-side function.
 * @param {string} referrerId - The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A list of users referred by the given user.
 */
export async function getReferredUsers(referrerId: string): Promise<ReferredUser[]> {
    if (!referrerId) {
        return [];
    }

    try {
        const referralsRef = collection(db, 'referrals');
        const q = query(referralsRef, where('referrerId', '==', referrerId), orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);

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
        console.error(`[CLIENT-SIDE] CRITICAL ERROR fetching referrals for ${referrerId}:`, error);
        throw error;
    }
}

    