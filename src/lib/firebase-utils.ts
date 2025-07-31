
'use server';

import { db } from '@/lib/firebase-admin';

/**
 * Finds a user by their email address using the Admin SDK.
 * This is a shared utility for server actions.
 * @returns The user object or null if not found.
 */
export async function findUserByEmailAdmin(email: string): Promise<{id: string; data: any} | null> {
    if (!email) return null;
    const usersRef = db.collection('users');
    const q = usersRef.where('email', '==', email.toLowerCase()).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
        return null;
    }
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, data: userDoc.data() };
}
