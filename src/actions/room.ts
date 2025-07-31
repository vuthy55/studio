
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
 * This action is now idempotent and also resets the room's session state if it had previously ended.
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
        const roomDoc = await roomRef.get();
        
        // --- Refund Logic ---
        if (roomDoc.exists) {
            const roomData = roomDoc.data() as SyncRoom;
            // A refund is needed if there was a cost AND the room was never started.
            const needsRefund = (roomData.initialCost ?? 0) > 0 && !roomData.firstMessageAt;

            if (needsRefund) {
                const userRef = db.collection('users').doc(roomData.creatorUid);
                
                // 1. Refund tokens to the user
                batch.update(userRef, { tokenBalance: FieldValue.increment(roomData.initialCost!) });

                // 2. Log the refund transaction
                const logRef = userRef.collection('transactionLogs').doc();
                batch.set(logRef, {
                    actionType: 'sync_online_refund',
                    tokenChange: roomData.initialCost,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Refund for canceled room: "${roomData.topic}"`
                });
            }
        }
        // --- End Refund Logic ---

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
            
            // If the room was never started, it's a full refund of the initial cost.
            if (!roomData.firstMessageAt) {
                transaction.update(roomRef, { status: 'closed' });
                if (roomData.initialCost && roomData.initialCost > 0) {
                    const creatorRef = db.collection('users').doc(roomData.creatorUid);
                    transaction.update(creatorRef, { tokenBalance: FieldValue.increment(roomData.initialCost) });
                    const logRef = creatorRef.collection('transactionLogs').doc();
                    transaction.set(logRef, {
                        actionType: 'sync_online_refund',
                        tokenChange: roomData.initialCost,
                        timestamp: FieldValue.serverTimestamp(),
                        description: `Refund for unused room: "${roomData.topic}"`
                    });
                }
                return;
            }

            // If the room was started, calculate prorated refund.
            const creatorRef = db.collection('users').doc(roomData.creatorUid);
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


/**
 * Handles all logic when a participant exits a room, including emcee reassignment and room closure.
 * This is an atomic fire-and-forget action called by the client.
 */
export async function handleParticipantExit(roomId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room ID and User ID are required.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    const participantRef = roomRef.collection('participants').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) return; // Room already gone
            const roomData = roomDoc.data() as SyncRoom;
            
            // --- Idempotency Check ---
            // If the room is already closed, do nothing to prevent multiple refunds.
            if (roomData.status === 'closed') {
                return;
            }

            const participantDoc = await transaction.get(participantRef);
            if (!participantDoc.exists) return; // Participant already gone
            const participantData = participantDoc.data() as Participant;

            // Delete the leaving participant
            transaction.delete(participantRef);

            // Get all remaining participants within the same transaction
            const allParticipantsSnapshot = await transaction.get(roomRef.collection('participants'));
            
            // Filter out the currently exiting participant to get the "true" remaining count
            const remainingParticipants = allParticipantsSnapshot.docs.filter(doc => doc.id !== userId);

            // Check if the room is now empty
            if (remainingParticipants.length === 0) {
                // By calling this here, inside the transaction, we ensure it only runs ONCE.
                // The `endAndReconcileRoom` function itself has its own transaction,
                // but this outer transaction ensures we don't even attempt to call it multiple times.
                await endAndReconcileRoom(roomId);
                return; // Reconciliation handles closing the room, so we can stop here.
            }

            // If the room is not empty, check if an emcee left
            const wasEmcee = roomData.emceeEmails.includes(participantData.email);
            if (wasEmcee) {
                const remainingEmcees = roomData.emceeEmails.filter(email => email !== participantData.email);

                if (remainingEmcees.length === 0) {
                    // Last emcee left, promote the first person from the remaining list
                    const newEmcee = remainingParticipants[0].data() as Participant;
                    transaction.update(roomRef, {
                        emceeEmails: FieldValue.arrayUnion(newEmcee.email)
                    });
                    
                    // Note: We cannot create notifications inside this user-exit transaction
                    // because it might conflict with other writes. Notifications are non-critical
                    // and can be handled separately if needed, or by a different mechanism.
                } else {
                    // Other emcees remain, just remove the leaving one
                     transaction.update(roomRef, {
                        emceeEmails: FieldValue.arrayRemove(participantData.email)
                    });
                }
            }
        });
        return { success: true };

    } catch (error: any) {
        console.error(`Error handling participant exit for user ${userId} in room ${roomId}:`, error);
        // We don't return an error to the client as this is fire-and-forget
        return { success: false, error: 'Server-side exit handling failed.' };
    }
}

      