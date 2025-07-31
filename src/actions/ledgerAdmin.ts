
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { IssueTokensPayload } from '@/services/ledger';
import { findUserByEmailAdmin } from '@/lib/firebase-utils';
import { deleteCollection } from '@/lib/firestore-utils';


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


/**
 * Issues a specified amount of tokens to a user from an admin.
 */
export async function issueTokens(payload: IssueTokensPayload): Promise<{success: boolean, error?: string}> {
    const { email, amount, reason, description, adminUser } = payload;
    
    try {
        const recipient = await findUserByEmailAdmin(email);
        if (!recipient) {
            return { success: false, error: `User with email "${email}" not found.` };
        }

        const recipientRef = db.collection('users').doc(recipient.id);
        const logRef = recipientRef.collection('transactionLogs').doc();

        const batch = db.batch();
        
        // Increment user's token balance
        batch.update(recipientRef, { tokenBalance: FieldValue.increment(amount) });

        // Create transaction log
        batch.set(logRef, {
            actionType: 'admin_issue',
            tokenChange: amount,
            timestamp: FieldValue.serverTimestamp(),
            reason: reason,
            description: description,
            fromUserId: adminUser.uid,
            fromUserEmail: adminUser.email
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error issuing tokens:", error);
        return { success: false, error: "An unexpected server error occurred." };
    }
}
