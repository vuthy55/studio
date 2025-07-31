
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { SyncRoom, Participant, BlockedUser, RoomMessage, Transcript, SummaryParticipant, RoomSummary } from '@/lib/types';
import { getAppSettingsAction } from './settings';
import { sendRoomEndingSoonEmail } from './email';


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
            const initialCost = roomData.initialCost || 0;

            // Phase 1: Handle meetings that never started.
            if (!roomData.firstMessageAt) {
                transaction.update(roomRef, { status: 'closed', lastActivityAt: FieldValue.serverTimestamp() });
                if (initialCost > 0) {
                    const creatorRef = db.collection('users').doc(roomData.creatorUid);
                    transaction.update(creatorRef, { tokenBalance: FieldValue.increment(initialCost) });
                    const logRef = creatorRef.collection('transactionLogs').doc();
                    transaction.set(logRef, {
                        actionType: 'sync_online_refund',
                        tokenChange: initialCost,
                        timestamp: FieldValue.serverTimestamp(),
                        description: `Refund for unused room: "${roomData.topic}"`
                    });
                }
                return; // Reconciliation complete for unused room.
            }
            
            // If we reach here, the meeting started.
            const creatorRef = db.collection('users').doc(roomData.creatorUid);
            const startTime = (roomData.firstMessageAt as Timestamp).toMillis();
            const endTime = Date.now();
            const actualDurationMinutes = Math.ceil((endTime - startTime) / 60000);
            const bookedDurationMinutes = roomData.durationMinutes || 0;

            // Phase 2: Reconcile the initial booked time for the CREATOR.
            let refundAmount = 0;
            if (actualDurationMinutes < bookedDurationMinutes) {
                const costPerMinute = initialCost / bookedDurationMinutes;
                const minutesToRefund = bookedDurationMinutes - actualDurationMinutes;
                refundAmount = Math.round(minutesToRefund * costPerMinute);
            }
            
            if (refundAmount > 0) {
                transaction.update(creatorRef, { tokenBalance: FieldValue.increment(refundAmount) });
                const logRef = creatorRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'sync_online_refund',
                    tokenChange: refundAmount,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Prorated refund for room: "${roomData.topic}"`
                });
            }

            // Phase 3: Reconcile OVERTIME for the VOLUNTEER.
            const overtimeMinutes = Math.max(0, actualDurationMinutes - bookedDurationMinutes);
            if (overtimeMinutes > 0 && roomData.currentPayorId) {
                const settings = await getAppSettingsAction();
                const participantsSnapshot = await transaction.get(roomRef.collection('participants'));
                const participantCount = participantsSnapshot.size;
                const costPerPersonPerMinute = settings.costPerSyncOnlineMinute || 1;
                
                const overtimeCost = overtimeMinutes * participantCount * costPerPersonPerMinute;
                
                if (overtimeCost > 0) {
                    const payorRef = db.collection('users').doc(roomData.currentPayorId);
                    // Check payor's balance before debiting
                    const payorDoc = await transaction.get(payorRef);
                    const payorBalance = payorDoc.data()?.tokenBalance || 0;
                    const finalCharge = Math.min(overtimeCost, payorBalance); // Don't charge more than they have

                    if(finalCharge > 0) {
                        transaction.update(payorRef, { tokenBalance: FieldValue.increment(-finalCharge) });
                        const logRef = payorRef.collection('transactionLogs').doc();
                        transaction.set(logRef, {
                            actionType: 'live_sync_online_spend',
                            tokenChange: -finalCharge,
                            timestamp: FieldValue.serverTimestamp(),
                            description: `Overtime charge for room: "${roomData.topic}"`
                        });
                    }
                }
            }

            // Finally, update the room status.
            transaction.update(roomRef, { 
                status: 'closed',
                lastActivityAt: FieldValue.serverTimestamp() 
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error reconciling room ${roomId}:`, error);
        return { success: false, error: 'An unexpected server error occurred during reconciliation.' };
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

            const participantRef = roomRef.collection('participants').doc(userId);
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

/**
 * Handles sending an in-session reminder to all participants, including a special email to the creator.
 * This is an idempotent action.
 */
export async function handleMeetingReminder(roomId: string, creatorId: string): Promise<{ success: boolean; error?: string }> {
  if (!roomId || !creatorId) {
    return { success: false, error: 'Room and Creator IDs are required.' };
  }

  const roomRef = db.collection('syncRooms').doc(roomId);

  try {
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) throw new Error('Room not found.');
    const roomData = roomDoc.data() as SyncRoom;

    // Idempotency check
    if (roomData.endingReminderSent) {
      console.log(`[Reminder] Reminder already sent for room ${roomId}.`);
      return { success: true };
    }

    const [participantsSnapshot, settings, creatorDoc] = await Promise.all([
      roomRef.collection('participants').get(),
      getAppSettingsAction(),
      db.collection('users').doc(creatorId).get()
    ]);
    
    const creatorData = creatorDoc.data();
    if (!creatorData) throw new Error(`Creator with ID ${creatorId} not found.`);

    const minutesRemaining = roomData.reminderMinutes || 5;

    const batch = db.batch();
    
    // In-Chat System Message
    const messageRef = roomRef.collection('messages').doc();
    batch.set(messageRef, {
        speakerUid: 'system',
        speakerName: 'VibeSync Bot',
        type: 'reminder',
        text: `This meeting is scheduled to end in ${minutesRemaining} minutes. Anyone can click to pay to continue.`,
        createdAt: FieldValue.serverTimestamp(),
        actions: ['payToContinue'],
        speakerLanguage: 'en-US'
    });

    // Mark that the reminder has been sent
    batch.update(roomRef, { endingReminderSent: true });
    
    await batch.commit();
    
    return { success: true };
  } catch (error: any) {
    console.error(`Error sending reminder for room ${roomId}:`, error);
    return { success: false, error: 'Failed to send meeting reminder.' };
  }
}
      
/**
 * Allows a user to volunteer to pay for a meeting's overtime.
 * This action is transactional to prevent race conditions.
 */
export async function volunteerAsPayor(roomId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room and User IDs are required.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const [roomDoc, userDoc, participantsSnapshot, settings] = await Promise.all([
                transaction.get(roomRef),
                transaction.get(userRef),
                transaction.get(roomRef.collection('participants')),
                getAppSettingsAction() // This is read-only, safe to get outside transaction
            ]);

            if (!roomDoc.exists) throw new Error('Room not found.');
            if (!userDoc.exists) throw new Error('User not found.');

            const roomData = roomDoc.data() as SyncRoom;
            const userData = userDoc.data()!;

            // --- Prevent Race Condition ---
            // If another user just became the payor, the endingReminderSent flag would be reset to false
            // by the time this transaction runs. This check ensures we only act on the *first* volunteer for a cycle.
            if (!roomData.endingReminderSent) {
                console.log(`[Payor] Race condition prevented. Room ${roomId} already has a volunteer for this cycle.`);
                return; 
            }
            
            const participantCount = participantsSnapshot.size;
            const costPerMinute = settings.costPerSyncOnlineMinute || 1;
            const burnRate = participantCount * costPerMinute;

            const userBalance = userData.tokenBalance || 0;
            const extraMinutes = burnRate > 0 ? Math.floor(userBalance / burnRate) : 0;
            
            if (extraMinutes <= 0) {
                // User has no tokens to contribute, don't change anything.
                // A system message could be sent, but for now we fail silently.
                return;
            }

            const now = Date.now();
            const currentEffectiveEnd = roomData.effectiveEndTime ? (roomData.effectiveEndTime as Timestamp).toMillis() : now;
            const newEffectiveEndTime = new Date(currentEffectiveEnd + (extraMinutes * 60 * 1000));
            
            transaction.update(roomRef, {
                currentPayorId: userId,
                effectiveEndTime: newEffectiveEndTime,
                endingReminderSent: false // Reset the reminder flag for the next cycle
            });
            
             const messageRef = roomRef.collection('messages').doc();
             transaction.set(messageRef, {
                speakerUid: 'system',
                speakerName: 'VibeSync Bot',
                type: 'system',
                text: `${userData.name} has extended the meeting by ${extraMinutes} minutes!`,
                createdAt: FieldValue.serverTimestamp(),
                speakerLanguage: 'en-US'
            });

        });
        return { success: true };
    } catch (error: any) {
        console.error(`[Payor] Error volunteering for room ${roomId}:`, error);
        return { success: false, error: error.message || 'Could not volunteer to pay.' };
    }
}

    