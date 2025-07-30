
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { SyncRoom, Participant, RoomMessage, Transcript, SummaryParticipant } from '@/lib/types';


/**
 * Fetches all admin user IDs from the 'users' collection.
 * This is a helper function for creating notifications for all admins.
 */
async function getAdminUids(): Promise<string[]> {
    const adminsQuery = db.collection('users').where('role', '==', 'admin');
    const snapshot = await adminsQuery.get();
    if (snapshot.empty) {
        return [];
    }
    return snapshot.docs.map(doc => doc.id);
}

/**
 * Sets the 'firstMessageAt' timestamp on a room document if it doesn't already exist.
 * This action is now idempotent and adds a system message to indicate the meeting start.
 * It also resets the room's session state if it had previously ended.
 */
export async function setFirstMessageTimestamp(roomId: string): Promise<{success: boolean, error?: string}> {
    if (!roomId) {
        return { success: false, error: 'Room ID is required.' };
    }
    try {
        const roomRef = db.collection('syncRooms').doc(roomId);
        
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) {
                throw new Error("Room not found.");
            }

            const roomData = roomDoc.data() as SyncRoom;
            
            // Only proceed if the session hasn't officially started yet.
            if (!roomData.firstMessageAt) {
                 const updateData: Record<string, any> = {
                    firstMessageAt: FieldValue.serverTimestamp(),
                    lastSessionEndedAt: FieldValue.delete() // Clear any previous session end time
                };
                transaction.update(roomRef, updateData);

                // Add a system message to the chat
                const messageRef = roomRef.collection('messages').doc();
                transaction.set(messageRef, {
                    text: "The meeting has now officially started.",
                    speakerName: "System",
                    speakerUid: "system",
                    speakerLanguage: "en-US",
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to set first message timestamp for room ${roomId}:`, error);
        return { success: false, error: 'Failed to update timestamp on the server.' };
    }
}


/**
 * Performs a "soft delete" on a room by setting its status to 'closed'.
 * This is a server action and requires Firebase Admin privileges.
 * This will now also reset the timer state by clearing `firstMessageAt`.
 * @param {string} roomId The ID of the room to close.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function softDeleteRoom(roomId: string): Promise<{success: boolean, error?: string}> {
  if (!roomId) {
    console.error('softDeleteRoom error: No roomId provided.');
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    
    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) {
            throw new Error('Room not found.');
        }
        const roomData = roomDoc.data()!;

        // 1. Update room status and reset timer state
        transaction.update(roomRef, {
            status: 'closed',
            lastActivityAt: FieldValue.serverTimestamp(),
            firstMessageAt: null, // Reset the timer
        });
        
        // 2. Create notifications for all admins
        const adminUids = await getAdminUids();
        if (adminUids.length > 0) {
            for (const adminId of adminUids) {
                const notificationRef = db.collection('notifications').doc();
                transaction.set(notificationRef, {
                    userId: adminId,
                    type: 'room_closed',
                    message: `Room "${roomData.topic}" has been closed.`,
                    createdAt: FieldValue.serverTimestamp(),
                    read: false,
                    roomId: roomId,
                });
            }
        }
    });

    return { success: true };
  } catch (error: any) {
    console.error(`Error closing room ${roomId}:`, error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}
