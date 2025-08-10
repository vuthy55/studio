
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { SyncRoom, Participant, BlockedUser, RoomMessage, Transcript, SummaryParticipant, RoomSummary } from '@/lib/types';
import { getAppSettingsAction } from './settings';
import { sendRoomEndingSoonEmail, sendRoomInviteEmail } from './email';
import { deleteCollection } from '@/lib/firestore-utils';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';


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
        
        // --- Full Reconciliation Logic ---
        // This ensures any active or ended room has its cost correctly calculated
        // and tokens refunded/charged before deletion.
        await endAndReconcileRoom(roomId);
        // --- End Reconciliation Logic ---

        // Delete subcollections first
        await deleteCollection(`syncRooms/${roomId}/participants`, 50);
        await deleteCollection(`syncRooms/${roomId}/messages`, 50);

        // Then delete the main room document
        const roomRef = db.collection('syncRooms').doc(roomId);
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
            
            // Idempotency: If the room is already closed, do nothing.
            if (roomData.status === 'closed') {
                return;
            }

            const creatorRef = db.collection('users').doc(roomData.creatorUid);
            const creatorDoc = await transaction.get(creatorRef);
            if (!creatorDoc.exists) throw new Error("Room creator's user profile not found.");
            
            const now = Date.now();

            // Phase 1: Handle meetings that never started.
            if (!roomData.firstMessageAt) {
                if ((roomData.initialCost ?? 0) > 0) {
                    transaction.update(creatorRef, { tokenBalance: FieldValue.increment(roomData.initialCost!) });
                    const logRef = creatorRef.collection('transactionLogs').doc();
                    transaction.set(logRef, {
                        actionType: 'sync_online_refund',
                        tokenChange: roomData.initialCost,
                        timestamp: FieldValue.serverTimestamp(),
                        description: `Refund for unused room: "${roomData.topic}"`
                    });
                }
            } else {
                // Phase 2: Meeting started, reconcile full cost against the creator.
                const settings = await getAppSettingsAction();
                const costPerPersonPerMinute = settings.costPerSyncOnlineMinute || 1;
                
                const startTime = (roomData.firstMessageAt as Timestamp).toMillis();
                const endTime = now;
                const actualDurationMinutes = Math.ceil((endTime - startTime) / 60000);
                
                const participantsSnapshot = await transaction.get(roomRef.collection('participants'));
                const participantCount = participantsSnapshot.size > 0 ? participantsSnapshot.size : 1; 

                const totalCost = actualDurationMinutes * participantCount * costPerPersonPerMinute;
                const prepaidCost = roomData.initialCost || 0;
                
                const costDifference = totalCost - prepaidCost;
                
                if (costDifference < 0) {
                    // Refund for unused time to the creator
                    const refundAmount = Math.abs(costDifference);
                    transaction.update(creatorRef, { tokenBalance: FieldValue.increment(refundAmount) });
                    const logRef = creatorRef.collection('transactionLogs').doc();
                    transaction.set(logRef, {
                        actionType: 'sync_online_refund',
                        tokenChange: refundAmount,
                        timestamp: FieldValue.serverTimestamp(),
                        description: `Prorated refund for room: "${roomData.topic}"`
                    });
                } else if (costDifference > 0) {
                    // Charge for overtime to the creator
                    const creatorBalance = creatorDoc.data()?.tokenBalance || 0;
                    const finalCharge = Math.min(costDifference, creatorBalance);

                    if (finalCharge > 0) {
                        transaction.update(creatorRef, { tokenBalance: FieldValue.increment(-finalCharge) });
                        const logRef = creatorRef.collection('transactionLogs').doc();
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
                lastActivityAt: FieldValue.serverTimestamp(),
                lastSessionEndedAt: Timestamp.fromMillis(now)
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
export async function handleParticipantExit(roomId: string, userId: string): Promise<{ success: boolean; error?: string; debugLog: string[] }> {
    const debugLog: string[] = [`[START] handleParticipantExit called for room=${roomId}, user=${userId} at ${new Date().toISOString()}`];
    if (!roomId || !userId) {
        debugLog.push('[FAIL] Room ID and User ID are required.');
        return { success: false, error: 'Room ID and User ID are required.', debugLog };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    let wasLastParticipant = false;

    try {
        await db.runTransaction(async (transaction) => {
            debugLog.push('[TRANSACTION_START] Starting Firestore transaction.');
            const allParticipantsQuery = roomRef.collection('participants');

            // --- ALL READS FIRST ---
            const [roomDoc, allParticipantsSnapshot] = await Promise.all([
                transaction.get(roomRef),
                transaction.get(allParticipantsQuery)
            ]);
            // --- END OF READS ---

            if (!roomDoc.exists) {
                debugLog.push(`[TRANSACTION_INFO] Room ${roomId} no longer exists. Halting.`);
                return;
            }
            const roomData = roomDoc.data() as SyncRoom;
            debugLog.push(`[TRANSACTION_INFO] Room status is currently: ${roomData.status}`);

            if (roomData.status === 'closed') {
                debugLog.push('[TRANSACTION_INFO] Room already closed. Halting.');
                return;
            }

            const participantDoc = allParticipantsSnapshot.docs.find(doc => doc.id === userId);
            if (!participantDoc || !participantDoc.exists) {
                debugLog.push(`[TRANSACTION_INFO] Participant ${userId} already gone. Halting.`);
                return;
            }
            const participantData = participantDoc.data() as Participant;
            const remainingParticipantCount = allParticipantsSnapshot.size - 1;

            debugLog.push(`[TRANSACTION_INFO] DB shows ${allParticipantsSnapshot.size} total participant(s). After filtering exiting user ${userId}, ${remainingParticipantCount} remain.`);
            
            // --- ALL WRITES LAST ---
            const participantRef = roomRef.collection('participants').doc(userId);
            transaction.delete(participantRef);
            debugLog.push(`[TRANSACTION_ACTION] Participant ${userId} deletion added to transaction.`);

            if (remainingParticipantCount === 0) {
                wasLastParticipant = true;
                debugLog.push('[TRANSACTION_ACTION] LAST PARTICIPANT LEFT. Room will be reconciled after this transaction.');
            } else {
                const wasEmcee = roomData.emceeEmails.includes(participantData.email);
                if (wasEmcee) {
                    const remainingEmcees = roomData.emceeEmails.filter(email => email !== participantData.email);
                    if (remainingEmcees.length === 0) {
                        const newEmcee = allParticipantsSnapshot.docs.filter(doc => doc.id !== userId)[0].data() as Participant;
                        debugLog.push(`[TRANSACTION_ACTION] Last emcee left. Promoting ${newEmcee.email}.`);
                        transaction.update(roomRef, { emceeEmails: FieldValue.arrayUnion(newEmcee.email) });
                    } else {
                        debugLog.push(`[TRANSACTION_ACTION] Emcee ${participantData.email} left, others remain.`);
                        transaction.update(roomRef, { emceeEmails: FieldValue.arrayRemove(participantData.email) });
                    }
                }
            }
        });
        debugLog.push(`[TRANSACTION_SUCCESS] Transaction for user ${userId} completed successfully.`);

        // --- POST-TRANSACTION LOGIC ---
        if (wasLastParticipant) {
            debugLog.push('[POST_TRANSACTION] Calling endAndReconcileRoom.');
            const reconcileResult = await endAndReconcileRoom(roomId);
            if (reconcileResult.success) {
                debugLog.push('[POST_TRANSACTION] endAndReconcileRoom SUCCEEDED.');
            } else {
                debugLog.push(`[POST_TRANSACTION] endAndReconcileRoom FAILED: ${reconcileResult.error}`);
            }
        }
        
        await roomRef.update({ debugLog });
        return { success: true, debugLog };

    } catch (error: any) {
        debugLog.push(`[CRITICAL_FAIL] Transaction failed for user ${userId} in room ${roomId}: ${error.message}`);
        await roomRef.update({ debugLog });
        return { success: false, error: 'Server-side exit handling failed.', debugLog };
    }
}


/**
 * Handles sending an in-session reminder to all participants.
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

    // Always fetch the latest settings to ensure the reminder is dynamic
    const settings = await getAppSettingsAction();
    const minutesRemaining = settings.roomReminderMinutes || 5;

    const [participantsSnapshot, creatorDoc] = await Promise.all([
      roomRef.collection('participants').get(),
      db.collection('users').doc(creatorId).get()
    ]);
    
    const creatorData = creatorDoc.data();
    if (!creatorData) throw new Error(`Creator with ID ${creatorId} not found.`);

    const participantCount = participantsSnapshot.size;
    const costPerMinute = settings.costPerSyncOnlineMinute || 1;
    const burnRate = participantCount * costPerMinute;

    const creatorBalance = creatorData.tokenBalance || 0;
    const extraMinutes = burnRate > 0 ? Math.floor(creatorBalance / burnRate) : 0;
    
    const batch = db.batch();
    
    const messageText = extraMinutes > 0
        ? `This meeting is scheduled to end in ${minutesRemaining} minutes. The creator's balance can extend it for about ${extraMinutes} more minutes.`
        : `This meeting is scheduled to end in ${minutesRemaining} minutes. To continue, the creator needs more tokens.`;

    const messageRef = roomRef.collection('messages').doc();
    batch.set(messageRef, {
        speakerUid: 'system',
        speakerName: 'VibeSync Bot',
        type: 'reminder',
        text: messageText,
        createdAt: FieldValue.serverTimestamp(),
        actions: extraMinutes > 0 ? ['extendMeeting'] : [], // Action only available if creator can afford it
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
 * Allows the creator to extend a meeting using their available tokens.
 */
export async function extendMeeting(roomId: string, creatorId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId || !creatorId) {
        return { success: false, error: 'Room and Creator IDs are required.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    const creatorRef = db.collection('users').doc(creatorId);

    try {
        await db.runTransaction(async (transaction) => {
            const [roomDoc, creatorDoc, participantsSnapshot, settings] = await Promise.all([
                transaction.get(roomRef),
                transaction.get(creatorRef),
                transaction.get(roomRef.collection('participants')),
                getAppSettingsAction()
            ]);

            if (!roomDoc.exists) throw new Error('Room not found.');
            if (!creatorDoc.exists) throw new Error('Creator not found.');

            const roomData = roomDoc.data() as SyncRoom;
            const creatorData = creatorDoc.data()!;
            
            const participantCount = participantsSnapshot.size;
            const costPerMinute = settings.costPerSyncOnlineMinute || 1;
            const burnRate = participantCount * costPerMinute;

            const creatorBalance = creatorData.tokenBalance || 0;
            const extraMinutes = burnRate > 0 ? Math.floor(creatorBalance / burnRate) : 0;
            
            if (extraMinutes <= 0) {
                return;
            }

            const now = Date.now();
            const currentEffectiveEnd = roomData.effectiveEndTime ? (roomData.effectiveEndTime as Timestamp).toMillis() : (roomData.scheduledAt as Timestamp).toMillis() + (roomData.durationMinutes! * 60 * 1000);
            const newEffectiveEndTime = new Date(currentEffectiveEnd + (extraMinutes * 60 * 1000));
            
            const updatePayload = {
                effectiveEndTime: newEffectiveEndTime,
                endingReminderSent: false // Reset the reminder flag for the next cycle
            };
            transaction.update(roomRef, updatePayload);
            
             const messageRef = roomRef.collection('messages').doc();
             const systemMessage = {
                speakerUid: 'system',
                speakerName: 'VibeSync Bot',
                type: 'system',
                text: `${creatorData.name} has extended the meeting by ${extraMinutes} minutes!`,
                createdAt: FieldValue.serverTimestamp(),
                speakerLanguage: 'en-US'
            };
             transaction.set(messageRef, systemMessage);
        });
        return { success: true };
    } catch (error: any) {
        console.error(`[DEBUG] Error in extendMeeting for room ${roomId}:`, error);
        return { success: false, error: error.message || 'Could not extend the meeting.' };
    }
}
    
interface CreatePrivateSyncOnlineRoomPayload {
    initiator: Participant;
    invitee: { email: string; };
}

export async function createPrivateSyncOnlineRoom(payload: CreatePrivateSyncOnlineRoomPayload): Promise<{ success: boolean; roomId?: string; error?: string }> {
    const { initiator, invitee } = payload;
    const settings = await getAppSettingsAction();
    const duration = 15; // Default to 15 minutes for 1-on-1 calls
    const costPerMinute = settings.costPerSyncOnlineMinute || 1;
    const calculatedCost = duration * 2 * costPerMinute; // 2 participants

    const userRef = db.collection('users').doc(initiator.uid);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists || (userDoc.data()?.tokenBalance || 0) < calculatedCost) {
            return { success: false, error: `Insufficient tokens. You need ${calculatedCost} tokens to make this call.` };
        }

        const newRoomRef = db.collection('syncRooms').doc();
        const batch = db.batch();

        const roomData: Omit<SyncRoom, 'id'> = {
            topic: `Call with ${initiator.name}`,
            creatorUid: initiator.uid,
            creatorName: initiator.name,
            createdAt: FieldValue.serverTimestamp(),
            status: 'active',
            invitedEmails: [initiator.email, invitee.email],
            emceeEmails: [initiator.email],
            scheduledAt: FieldValue.serverTimestamp(),
            durationMinutes: duration,
            initialCost: calculatedCost,
            hasStarted: true,
            reminderMinutes: settings.roomReminderMinutes
        };
        batch.set(newRoomRef, roomData);

        // Deduct cost
        batch.update(userRef, { tokenBalance: FieldValue.increment(-calculatedCost) });

        // Log transaction
        const logRef = userRef.collection('transactionLogs').doc();
        batch.set(logRef, {
            actionType: 'live_sync_online_spend',
            tokenChange: -calculatedCost,
            timestamp: FieldValue.serverTimestamp(),
            description: `Started a 1-on-1 call with ${invitee.email}`
        });

        await batch.commit();

        // Send notification to invitee
        await sendRoomInviteEmail({
            to: [invitee.email],
            roomTopic: roomData.topic,
            fromName: initiator.name,
            roomId: newRoomRef.id,
            scheduledAt: new Date(),
            joinUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/join/${newRoomRef.id}`
        });

        return { success: true, roomId: newRoomRef.id };

    } catch (error: any) {
        console.error("Error creating private sync online room:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


export async function summarizeRoomAction(roomId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  if (!roomId || !userId) {
    return { success: false, error: 'Room ID and User ID are required.' };
  }
  try {
    const result = await summarizeRoom({ roomId, userId });
    if (result) {
        return { success: true };
    } else {
        return { success: false, error: 'Summary generation returned no result.' };
    }
  } catch (error: any) {
    console.error("Error summarizing room:", error);
    return { success: false, error: error.message || "Failed to generate summary." };
  }
}

/**
 * Fetches the full transcript for a room, charging the user for it.
 */
export async function getTranscriptAction(roomId: string, userId: string): Promise<{ success: boolean; transcript?: string; error?: string; }> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room ID and User ID are required.' };
    }
    
    const settings = await getAppSettingsAction();
    const cost = settings.transcriptCost || 25;
    
    const userRef = db.collection('users').doc(userId);
    const roomRef = db.collection('syncRooms').doc(roomId);

    try {
        const transcript = await db.runTransaction(async (transaction) => {
            // --- READS FIRST ---
            const userDoc = await transaction.get(userRef);
            const messagesQuery = roomRef.collection('messages').orderBy('createdAt', 'asc');
            const messagesSnapshot = await transaction.get(messagesQuery);

            // --- VALIDATION ---
            if (!userDoc.exists) throw new Error('User not found.');
            
            const userBalance = userDoc.data()?.tokenBalance || 0;
            if (userBalance < cost) throw new Error('Insufficient tokens for a transcript.');
            
            // --- WRITES LAST ---
            transaction.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
            const logRef = userRef.collection('transactionLogs').doc();
            transaction.set(logRef, {
                actionType: 'translation_spend', // Using a generic spend type
                tokenChange: -cost,
                timestamp: FieldValue.serverTimestamp(),
                description: `Generated transcript for room: "${roomRef.id}"`,
                reason: 'Transcript Download'
            });

            // --- PROCESS & RETURN ---
            const formattedMessages = messagesSnapshot.docs.map(doc => {
                const msg = doc.data() as RoomMessage;
                const time = (msg.createdAt as Timestamp)?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '00:00:00';
                return `[${time}] ${msg.speakerName}: ${msg.text}`;
            });

            return formattedMessages.join('\n');
        });

        return { success: true, transcript };

    } catch (error: any) {
        console.error("Error getting transcript:", error);
        return { success: false, error: error.message || 'Could not generate transcript.' };
    }
}
    
