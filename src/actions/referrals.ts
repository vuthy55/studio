
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
    // Top-level log to ensure the function is even invoked.
    console.log(`[SERVER-DEBUG] getReferredUsers invoked with referrerId: ${referrerId}`);
    
    if (!referrerId) {
        console.log("[SERVER-DEBUG] No referrerId provided. Returning empty array.");
        return [];
    }

    try {
        console.log("[SERVER-DEBUG] Inside try block. Preparing to query Firestore.");
        const usersRef = db.collection('users');
        const q = usersRef.where('referredBy', '==', referrerId).orderBy('createdAt', 'desc');
        
        console.log(`[SERVER-DEBUG] Executing query: users.where('referredBy', '==', '${referrerId}')`);
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log("[SERVER-DEBUG] Query returned no documents. No referred users found.");
            return [];
        }

        console.log(`[SERVER-DEBUG] Query found ${snapshot.size} referred user(s). Mapping results...`);

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = (data.createdAt as Timestamp)?.toDate()?.toISOString() || new Date(0).toISOString();
            
            const referredUser: ReferredUser = {
                id: doc.id,
                name: data.name || null,
                email: data.email,
                createdAt: createdAt,
            };
            console.log("[SERVER-DEBUG] Mapped document:", referredUser);
            return referredUser;
        });

        console.log("[SERVER-DEBUG] Finished mapping. Returning results.");
        return results;

    } catch (error) {
        console.error(`[SERVER-DEBUG] CRITICAL ERROR fetching referred users for ${referrerId}:`, error);
        // Return empty array on error to prevent client crashes
        return [];
    }
}
