
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { LanguageCode } from '@/lib/data';

/**
 * Recursively deletes a collection in Firestore.
 * This is used to clear non-essential user data like practice history.
 */
async function deleteCollection(collectionPath: string, batchSize: number) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(query: FirebaseFirestore.Query, resolve: (value?: unknown) => void) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}


/**
 * Performs a "soft delete" initiated by the user.
 * This deactivates the user's account and deletes personal data, but anonymizes
 * and retains legally required records like financial transactions.
 * @param {{userId: string}} payload An object containing the user ID to deactivate.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function anonymizeAndDeactivateUser(payload: { userId: string }): Promise<{success: boolean, error?: string}> {
    const { userId } = payload;
    if (!userId) {
        return { success: false, error: "No user ID provided." };
    }

    try {
        // --- Step 1: Delete from Firebase Authentication ---
        // This prevents the user from logging in again.
        await auth.deleteUser(userId);

        // --- Step 2: Delete non-essential subcollections ---
        // This includes things like practice history that are not required for legal compliance.
        // We are NOT deleting 'transactionLogs' or 'paymentHistory'.
        await deleteCollection(`users/${userId}/practiceHistory`, 50);

        // --- Step 3: Delete the main user profile document ---
        // This removes their name, email, country, etc., effectively anonymizing any
        // remaining records that might reference the user ID.
        const userDocRef = db.collection('users').doc(userId);
        await userDocRef.delete();
        
        // Note: The transactionLogs and paymentHistory subcollections now belong to a
        // "parentless" document, which is valid in Firestore. They are retained
        // for financial auditing but no longer link back to an identifiable person.

        return { success: true };

    } catch (error: any) {
        console.error("Error deactivating and anonymizing user:", error);
        // Provide a more specific error message if possible
        if (error.code === 'auth/user-not-found') {
             return { success: false, error: "This user account may have already been deleted." };
        }
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


export async function unlockLanguagePackAction(userId: string, lang: LanguageCode, cost: number): Promise<{success: boolean, error?: string}> {
    if (!userId || !lang || cost < 0) {
        return { success: false, error: 'Invalid arguments provided.' };
    }

    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found.');
            }

            const userBalance = userDoc.data()?.tokenBalance || 0;
            if (userBalance < cost) {
                throw new Error('Insufficient tokens.');
            }

            // 1. Deduct cost and add language atomically
            transaction.update(userRef, {
                tokenBalance: FieldValue.increment(-cost),
                unlockedLanguages: FieldValue.arrayUnion(lang)
            });

            // 2. Add to transaction log
            const logRef = userRef.collection('transactionLogs').doc();
            transaction.set(logRef, {
                actionType: 'language_pack_download',
                tokenChange: -cost,
                timestamp: FieldValue.serverTimestamp(),
                description: `Unlocked ${lang} language pack.`
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error unlocking language pack for user ${userId}:`, error);
        return { success: false, error: error.message || 'A server error occurred during the transaction.' };
    }
}
