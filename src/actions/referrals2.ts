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
    console.log(`[SERVER-DEBUG-V2] getReferredUsers2: Function invoked for referrerId: ${referrerId}`);
    
    if (!referrerId) {
        console.log("[SERVER-DEBUG-V2] No referrerId provided. Returning empty array.");
        return [];
    }

    try {
        console.log(`[SERVER-DEBUG-V2] Searching for referrals made by: ${referrerId}`);
        
        const referralsRef = db.collection('referrals');
        const q = referralsRef.where('referrerId', '==', referrerId).orderBy('createdAt', 'desc');
        
        console.log('[SERVER-DEBUG-V2] Query created. Fetching snapshot...');
        const snapshot = await q.get();
        console.log(`[SERVER-DEBUG-V2] Snapshot fetched. Found ${snapshot.size} documents.`);

        if (snapshot.empty) {
            console.log(`[SERVER-DEBUG-V2] No referral documents found for ${referrerId}.`);
            return [];
        }

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log(`[SERVER-DEBUG-V2] Processing doc ${doc.id} with data:`, JSON.stringify(data));
            
            const createdAt = (data.createdAt as Timestamp)?.toDate()?.toISOString() || new Date(0).toISOString();
            
            const referredUser: ReferredUser = {
                id: doc.id,
                name: data.referredUserName || null,
                email: data.referredUserEmail,
                createdAt: createdAt,
            };
            return referredUser;
        });
        
        console.log(`[SERVER-DEBUG-V2] Successfully processed ${results.length} referrals.`);
        return results;

    } catch (error) {
        console.error(`[SERVER-DEBUG-V2] CRITICAL ERROR fetching referrals for ${referrerId}:`, error);
        return [];
    }
}
