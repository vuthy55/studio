
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { SyncRoom, Participant, RoomMessage, Transcript, SummaryParticipant, RoomSummary } from '@/lib/types';


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
 * Recursively deletes a subcollection.
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

export async function permanentlyDeleteRooms(roomIds: string[]): Promise<{success: boolean, error?: string}> {
  if (!roomIds || roomIds.length === 0) {
    return { success: false, error: "No room IDs provided." };
  }

  try {
    const batch = db.batch();
    for (const roomId of roomIds) {
        const roomRef = db.collection('syncRooms').doc(roomId);
        
        // Delete subcollections first
        await deleteCollection(`syncRooms/${roomId}/participants`, 50);
        await deleteCollection(`syncRooms/${roomId}/messages`, 50);

        // Then delete the main room document
        batch.delete(roomRef);
    }
    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error("Error deleting rooms:", error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}

export async function updateRoomSummary(roomId: string, summary: RoomSummary): Promise<{success: boolean, error?: string}> {
  if (!roomId || !summary) {
    return { success: false, error: "Room ID and summary are required." };
  }
  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    await roomRef.update({ summary });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating room summary:", error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}

export async function requestSummaryEditAccess(roomId: string, roomTopic: string, userName: string): Promise<{success: boolean, error?: string}> {
    if (!roomId || !userName) {
        return { success: false, error: 'Room ID and user name are required.' };
    }
    try {
        const adminUids = await getAdminUids();
        const batch = db.batch();
        for (const adminId of adminUids) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: adminId,
                type: 'edit_request',
                message: `${userName} is requesting edit access for the summary of room "${roomTopic}".`,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
                roomId: roomId,
            });
        }
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error requesting edit access:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


export async function updateScheduledRoom({ roomId, userId, updates, newCost }: { roomId: string, userId: string, updates: Partial<SyncRoom>, newCost: number }): Promise<{success: boolean, error?: string}> {
    if (!roomId) return { success: false, error: 'Room ID is required.' };
    
    const roomRef = db.collection('syncRooms').doc(roomId);
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            const userDoc = await transaction.get(userRef);

            if (!roomDoc.exists) throw new Error('Room not found.');
            if (!userDoc.exists) throw new Error('User not found.');
            
            const roomData = roomDoc.data() as SyncRoom;
            const userData = userDoc.data();
            const originalCost = roomData.initialCost || 0;
            const costDifference = newCost - originalCost;

            if ((userData?.tokenBalance || 0) < costDifference) {
                throw new Error('Insufficient tokens for this update.');
            }
            
            transaction.update(roomRef, {
                ...updates,
                initialCost: newCost,
                lastActivityAt: FieldValue.serverTimestamp()
            });

            if (costDifference !== 0) {
                 transaction.update(userRef, {
                    tokenBalance: FieldValue.increment(-costDifference)
                });
                
                const logRef = userRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'live_sync_online_spend',
                    tokenChange: -costDifference,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Cost adjustment for updating room: "${roomData.topic}"`
                });
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error updating scheduled room:", error);
        return { success: false, error: error.message || 'An unexpected server error occurred.' };
    }
}


export async function setRoomEditability(roomId: string, allowEdits: boolean): Promise<{ success: boolean; error?: string }> {
  if (!roomId) {
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    await roomRef.update({ 'summary.allowMoreEdits': allowEdits });
    return { success: true };
  } catch (error: any) {
    console.error(`Error setting editability for room ${roomId}:`, error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}

export async function endAndReconcileRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId) return { success: false, error: 'Room ID is required.' };

    const roomRef = db.collection('syncRooms').doc(roomId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) throw new Error('Room not found.');

            const roomData = roomDoc.data() as SyncRoom;
            const creatorRef = db.collection('users').doc(roomData.creatorUid);

            if (!roomData.firstMessageAt) {
                // No one ever spoke, just close the room
                transaction.update(roomRef, { status: 'closed' });
                return;
            }

            const startTime = (roomData.firstMessageAt as Timestamp).toMillis();
            const endTime = Date.now();
            const actualDurationMinutes = Math.ceil((endTime - startTime) / 60000);
            const bookedDurationMinutes = roomData.durationMinutes || 0;
            
            let refundAmount = 0;
            if (actualDurationMinutes < bookedDurationMinutes) {
                const minutesToRefund = bookedDurationMinutes - actualDurationMinutes;
                const costPerMinute = (roomData.initialCost || 0) / bookedDurationMinutes;
                refundAmount = Math.round(minutesToRefund * costPerMinute);
            }
            
            const updates: any = { status: 'closed' };
            if (refundAmount > 0) {
                 updates['summary.refundAmount'] = refundAmount; // Optional: Log refund in summary
            }
            transaction.update(roomRef, updates);

            if (refundAmount > 0) {
                transaction.update(creatorRef, { tokenBalance: FieldValue.increment(refundAmount) });
                
                const logRef = creatorRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'sync_online_refund',
                    tokenChange: refundAmount,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Refund for unused time in room: "${roomData.topic}"`
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error reconciling room ${roomId}:`, error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


export async function handleEmceeExit(roomId: string, leavingEmceeId: string): Promise<{ success: boolean; error?: string }> {
  if (!roomId || !leavingEmceeId) {
    return { success: false, error: 'Room ID and leaving emcee ID are required.' };
  }

  const roomRef = db.collection('syncRooms').doc(roomId);

  try {
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) throw new Error('Room not found.');

    const roomData = roomDoc.data() as SyncRoom;
    const leavingEmceeEmail = roomData.emceeEmails.find(email => auth.getUserByEmail(email).then(u => u.uid === leavingEmceeId));
    
    const remainingEmcees = roomData.emceeEmails.filter(email => email !== leavingEmceeEmail);
    
    await roomRef.update({ emceeEmails: remainingEmcees });

    if (remainingEmcees.length === 0) {
      const participantsSnapshot = await roomRef.collection('participants').limit(1).get();
      if (participantsSnapshot.empty) {
        await endAndReconcileRoom(roomId);
      } else {
        const newEmcee = participantsSnapshot.docs[0].data() as Participant;
        await roomRef.update({ emceeEmails: FieldValue.arrayUnion(newEmcee.email) });
        
        const notificationRef = db.collection('notifications').doc();
        await notificationRef.set({
            userId: newEmcee.uid,
            type: 'edit_request', // a generic 'you have been promoted' type could be better
            message: `You have been promoted to emcee for the room "${roomData.topic}".`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
            roomId: roomId,
        });
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error(`Error handling emcee exit for room ${roomId}:`, error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}
