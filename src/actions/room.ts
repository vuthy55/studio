
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Performs a "soft delete" on a room by setting its status to 'closed'.
 * This is a server action and requires Firebase Admin privileges.
 *
 * @param {string} roomId The ID of the room to close.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function softDeleteRoom(roomId: string): Promise<{success: boolean, error?: string}> {
  console.log(`[ACTION] softDeleteRoom invoked for roomId: ${roomId}`);
  if (!roomId) {
    console.error('softDeleteRoom error: No roomId provided.');
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    
    await roomRef.update({
      status: 'closed',
      lastActivityAt: FieldValue.serverTimestamp(),
    });

    console.log(`[ACTION] Successfully soft-deleted room ${roomId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ACTION] Failed to soft delete room ${roomId}:`, error);
    return { success: false, error: 'Failed to close the room on the server.' };
  }
}


/**
 * Permanently deletes rooms from Firestore. This is a hard delete and is irreversible.
 * Note: For simplicity, this does not recursively delete subcollections like 'participants' or 'messages'.
 * In a production environment, a Cloud Function would be recommended for this task.
 *
 * @param {string[]} roomIds An array of room IDs to delete.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function permanentlyDeleteRooms(roomIds: string[]): Promise<{success: boolean, error?: string}> {
  console.log(`[ACTION] permanentlyDeleteRooms invoked for ${roomIds.length} rooms.`);
  if (!roomIds || roomIds.length === 0) {
    return { success: false, error: 'At least one room ID is required.' };
  }

  try {
    const batch = db.batch();
    
    roomIds.forEach(id => {
        const roomRef = db.collection('syncRooms').doc(id);
        batch.delete(roomRef);
    });
    
    await batch.commit();

    console.log(`[ACTION] Successfully deleted ${roomIds.length} rooms.`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ACTION] Failed to permanently delete rooms:`, error);
    return { success: false, error: 'Failed to delete rooms on the server.' };
  }
}
