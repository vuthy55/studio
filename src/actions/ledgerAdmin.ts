
'use server';

import { db } from '@/lib/firebase-admin';
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
 * Clears all entries from the financial ledger.
 * This is a highly destructive action and should be used with caution.
 */
export async function clearFinancialLedger(): Promise<{success: boolean, error?: string}> {
    try {
        await deleteCollection('financialLedger', 100);
        return { success: true };
    } catch (error: any) {
        console.error("Error clearing financial ledger:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


/**
 * Clears the token transaction history for ALL users AND resets their token balances to 0.
 * This is a highly destructive action.
 */
export async function clearTokenLedger(): Promise<{success: boolean, error?: string}> {
    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            return { success: true }; // Nothing to do
        }

        // Use a batched write to update all user balances.
        const balanceBatch = db.batch();
        usersSnapshot.docs.forEach(userDoc => {
            balanceBatch.update(userDoc.ref, { tokenBalance: 0 });
        });
        await balanceBatch.commit();


        // Now, delete all transaction log subcollections.
        const deletionPromises = usersSnapshot.docs.map(userDoc => {
            return deleteCollection(`users/${userDoc.id}/transactionLogs`, 100);
        });

        await Promise.all(deletionPromises);

        return { success: true };
    } catch (error: any) {
        console.error("Error clearing token ledgers:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}
