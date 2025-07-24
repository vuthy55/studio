
'use server';

import { db } from '@/lib/firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';

export interface ReferredUser {
  id: string;
  name?: string;
  email: string;
  createdAt?: string;
}

/**
 * Fetches all users who were referred by a specific user.
 * @param referrerUid The UID of the user who made the referrals.
 * @returns {Promise<ReferredUser[]>} A promise that resolves to an array of referred user details.
 */
export async function getReferredUsers(referrerUid: string): Promise<ReferredUser[]> {
  if (!referrerUid) {
    return [];
  }

  try {
    const referralsRef = db.collection('referrals');
    const q = referralsRef.where('referrerUid', '==', referrerUid);
    const snapshot = await q.get();

    if (snapshot.empty) {
      return [];
    }
    
    const referredUids = snapshot.docs.map(doc => doc.data().referredUid);

    if (referredUids.length === 0) {
        return [];
    }

    const usersRef = db.collection('users');
    const usersQuery = usersRef.where('__name__', 'in', referredUids);
    const usersSnapshot = await usersQuery.get();

    return usersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            email: data.email,
            createdAt: (data.createdAt as Timestamp)?.toDate().toISOString(),
        }
    });

  } catch (error) {
    console.error("Error fetching referred users:", error);
    // In case of an error, return an empty array to prevent the client from crashing.
    return [];
  }
}
