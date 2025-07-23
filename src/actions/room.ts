
'use server';

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../workspace/src/lib/firebase-admin';

/**
 * Performs a "soft delete" on a room by setting its status to 'closed'.
 * This is a server action and requires Firebase Admin privileges.
 *
 * @param {string} roomId The ID of the room to close.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function softDeleteRoom(roomId: string): Promise<{success: boolean, error?: string}> {
  if (!roomId) {
    console.error('softDeleteRoom error: No roomId provided.');
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = doc(db, 'syncRooms', roomId);
    
    await updateDoc(roomRef, {
      status: 'closed',
      lastActivityAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`Failed to soft delete room ${roomId}:`, error);
    return { success: false, error: 'Failed to close the room on the server.' };
  }
}
