
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { TransferTokensPayload } from '@/services/ledger';


/**
 * Finds a user by their email address using the Admin SDK.
 * @returns {Promise<{id: string, email: string, name: string} | null>} The user object or null if not found.
 */
async function findUserByEmailAdmin(email: string): Promise<{id: string; data: any} | null> {
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


/**
 * Transfers tokens from one user to another using the Admin SDK for secure, atomic execution.
 */
export async function transferTokensAction(payload: TransferTokensPayload): Promise<{success: boolean, error?: string}> {
    const { fromUserId, fromUserEmail, toUserEmail, amount, description } = payload;

    if (fromUserEmail.toLowerCase() === toUserEmail.toLowerCase()) {
        return { success: false, error: "Cannot transfer tokens to yourself." };
    }
    
    try {
        const recipient = await findUserByEmailAdmin(toUserEmail);
        if (!recipient) {
            return { success: false, error: `Recipient with email "${toUserEmail}" not found.` };
        }
        
        const senderRef = db.collection('users').doc(fromUserId);
        const recipientRef = db.collection('users').doc(recipient.id);

        const batch = db.batch();

        // 1. Check sender's balance
        const senderDoc = await senderRef.get();
        const senderData = senderDoc.data();
        if (!senderDoc.exists() || (senderData?.tokenBalance ?? 0) < amount) {
            return { success: false, error: "Insufficient balance for this transfer." };
        }

        // 2. Debit the sender
        batch.update(senderRef, { tokenBalance: FieldValue.increment(-amount) });
        const senderLogRef = senderRef.collection('transactionLogs').doc();
        batch.set(senderLogRef, {
            actionType: 'p2p_transfer',
            tokenChange: -amount,
            timestamp: FieldValue.serverTimestamp(),
            description: description,
            toUserId: recipient.id,
            toUserEmail: recipient.data.email
        });

        // 3. Credit the recipient
        batch.update(recipientRef, { tokenBalance: FieldValue.increment(amount) });
        const recipientLogRef = recipientRef.collection('transactionLogs').doc();
        batch.set(recipientLogRef, {
            actionType: 'p2p_transfer',
            tokenChange: amount,
            timestamp: FieldValue.serverTimestamp(),
            description: description,
            fromUserId: fromUserId,
            fromUserEmail: fromUserEmail,
        });

        // 4. Create notification for recipient
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            userId: recipient.id,
            type: 'p2p_transfer',
            fromUserName: senderData?.name || fromUserEmail,
            amount: amount,
            message: description,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        });

        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        console.error("Error transferring tokens (Admin Action):", error);
        // Provide a more detailed error message to the client for debugging
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}
