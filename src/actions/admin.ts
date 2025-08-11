
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteCollection } from '@/lib/firestore-utils';


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
        const { successCount, errors } = await auth.deleteUsers(userIds);

        // Log any auth deletion errors but don't stop the process unless all fail
        if (errors.length > 0) {
            console.warn(`[deleteUsers] Some users could not be deleted from Auth. Success: ${successCount}, Failures: ${errors.length}`);
            errors.forEach(err => {
                // We specifically want to ignore 'user-not-found' as it means the user is already gone from Auth.
                if (err.error.code !== 'auth/user-not-found') {
                    console.error(`- User Index ${err.index}: ${err.error.message}`);
                }
            });
        }


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

/**
 * Clears the payment history for a specific user.
 * This is a destructive action and should be used with caution.
 * @param {string} userId The ID of the user whose payment history will be cleared.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function clearUserPaymentHistory(userId: string): Promise<{success: boolean, error?: string}> {
    if (!userId) {
        return { success: false, error: 'User ID is required.' };
    }

    try {
        await deleteCollection(`users/${userId}/paymentHistory`, 100);
        return { success: true };
    } catch (error: any) {
        console.error(`Error clearing payment history for user ${userId}:`, error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


/**
 * Clears all notifications from the 'notifications' collection.
 * This is a destructive action.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function clearAllNotifications(): Promise<{success: boolean, error?: string}> {
    try {
        await deleteCollection('notifications', 100);
        return { success: true };
    } catch (error: any) {
        console.error("Error clearing notification data:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}

/**
 * Deletes specified notifications from the 'notifications' collection.
 * @param {string[]} notificationIds An array of notification IDs to delete.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function deleteNotifications(notificationIds: string[]): Promise<{success: boolean, error?: string}> {
    if (!notificationIds || notificationIds.length === 0) {
        return { success: false, error: "No notification IDs provided." };
    }

    try {
        const batch = db.batch();
        notificationIds.forEach(id => {
            const notificationRef = db.collection('notifications').doc(id);
            batch.delete(notificationRef);
        });
        await batch.commit();
        return { success: true };

    } catch (error: any) {
        console.error("Error deleting notifications:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}

/**
 * Resets a user's entire practice history by deleting the subcollection.
 * @param {string} userId The ID of the user whose practice history will be cleared.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function resetUserPracticeHistory(userId: string): Promise<{success: boolean, error?: string}> {
    if (!userId) {
        return { success: false, error: 'User ID is required.' };
    }

    try {
        await deleteCollection(`users/${userId}/practiceHistory`, 100);
        return { success: true };
    } catch (error: any) {
        console.error(`Error clearing practice history for user ${userId}:`, error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}
