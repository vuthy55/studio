
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
 * Fetches users who were referred by a specific user.
 * @param {string} referrerId - The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A list of users referred by the given user.
 */
export async function getReferredUsers(referrerId: string): Promise<ReferredUser[]> {
    console.log(`[DEBUG] getReferredUsers called with referrerId: ${referrerId}`);
    if (!referrerId) {
        console.log("[DEBUG] No referrerId provided. Returning empty array.");
        return [];
    }

    try {
        const usersRef = db.collection('users');
        const q = usersRef.where('referredBy', '==', referrerId).orderBy('createdAt', 'desc');
        console.log(`[DEBUG] Executing query: users.where('referredBy', '==', '${referrerId}')`);
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log("[DEBUG] Query returned no documents. No referred users found.");
            return [];
        }

        console.log(`[DEBUG] Query found ${snapshot.size} referred user(s).`);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = (data.createdAt as Timestamp)?.toDate()?.toISOString() || new Date(0).toISOString();
            const referredUser = {
                id: doc.id,
                name: data.name || null,
                email: data.email,
                createdAt: createdAt,
            };
            console.log("[DEBUG] Mapping document:", referredUser);
            return referredUser;
        });

    } catch (error) {
        console.error(`[DEBUG] Error fetching referred users for ${referrerId}:`, error);
        // Return empty array on error to prevent client crashes
        return [];
    }
}
