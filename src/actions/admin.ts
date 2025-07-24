
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Recursively deletes a collection in Firestore.
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
 * Deletes specified users from Firebase Auth and Firestore, including their subcollections.
 * Includes a safeguard to prevent deletion of the last administrator.
 * @param {string[]} userIds An array of user IDs to delete.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function deleteUsers(userIds: string[]): Promise<{success: boolean, error?: string}> {
    if (!userIds || userIds.length === 0) {
        return { success: false, error: "No user IDs provided." };
    }

    try {
        // --- Safeguard for last admin deletion ---
        const adminsQuery = db.collection('users').where('role', '==', 'admin');
        const adminsSnapshot = await adminsQuery.get();
        const totalAdmins = adminsSnapshot.size;
        
        let adminsToDeleteCount = 0;
        adminsSnapshot.forEach(doc => {
            if (userIds.includes(doc.id)) {
                adminsToDeleteCount++;
            }
        });

        if (totalAdmins > 0 && adminsToDeleteCount >= totalAdmins) {
            return { success: false, error: "Cannot delete the last administrator account." };
        }
        // --- End Safeguard ---


        // Delete from Firebase Authentication
        await auth.deleteUsers(userIds);

        // Delete from Firestore
        const batch = db.batch();
        for (const userId of userIds) {
            const userDocRef = db.collection('users').doc(userId);
            
            // Delete subcollections first
            await deleteCollection(`users/${userId}/transactionLogs`, 50);
            await deleteCollection(`users/${userId}/paymentHistory`, 50);
            await deleteCollection(`users/${userId}/practiceHistory`, 50);

            // Then delete the main user document
            batch.delete(userDocRef);
        }
        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error deleting users:", error);
        // Provide a more specific error message if possible
        if (error.code === 'auth/user-not-found') {
             return { success: false, error: "One or more users were not found in Firebase Authentication and may have already been deleted." };
        }
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}
