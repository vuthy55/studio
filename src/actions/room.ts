
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
    
    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) {
            throw new Error('Room not found.');
        }
        const roomData = roomDoc.data()!;

        // 1. Update room status
        transaction.update(roomRef, {
            status: 'closed',
            lastActivityAt: FieldValue.serverTimestamp(),
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

    console.log(`[ACTION] Successfully soft-deleted room ${roomId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ACTION] Failed to soft delete room ${roomId}:`, error);
    return { success: false, error: 'Failed to close the room on the server.' };
  }
}

/**
 * Checks if a room has any messages. This action requires the user to be the room's creator.
 *
 * @param {string} roomId The ID of the room to check.
 * @param {string} userId The UID of the user making the request.
 * @returns {Promise<{success: boolean, hasActivity?: boolean, error?: string}>} An object indicating success and activity status.
 */
export async function checkRoomActivity(roomId: string, userId: string): Promise<{success: boolean, hasActivity?: boolean, error?: string}> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room ID and User ID are required.' };
    }

    try {
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            return { success: false, error: 'Room not found.' };
        }

        const roomData = roomDoc.data() as SyncRoom;
        if (roomData.creatorUid !== userId) {
            return { success: false, error: 'You are not authorized to manage this room.' };
        }

        const messagesRef = roomRef.collection('messages').limit(1);
        const snapshot = await messagesRef.get();
        
        return { success: true, hasActivity: !snapshot.empty };

    } catch (error: any) {
        console.error(`[ACTION] Failed to check activity for room ${roomId}:`, error);
        return { success: false, error: 'Failed to check room activity on the server.' };
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
    const adminUids = await getAdminUids();
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    for (const id of roomIds) {
      const roomRef = db.collection('syncRooms').doc(id);
      const roomDoc = await roomRef.get();
      
      if (roomDoc.exists) {
        const roomData = roomDoc.data()!;
        if (adminUids.length > 0) {
          for (const adminId of adminUids) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
              userId: adminId,
              type: 'room_closed',
              message: `Room "${roomData.topic}" was permanently deleted.`,
              createdAt: now,
              read: false,
              roomId: id,
            });
          }
        }
      }
      batch.delete(roomRef);
    }
    
    await batch.commit();

    console.log(`[ACTION] Successfully deleted ${roomIds.length} rooms.`);
    return { success: true };
  } catch (error: any) {
    console.error(`[ACTION] Failed to permanently delete rooms:`, error);
    return { success: false, error: 'Failed to delete rooms on the server.' };
  }
}

/**
 * Updates the summary of a room. This action requires the user to be an emcee.
 *
 * @param {string} roomId The ID of the room to update.
 * @param {any} summary The new summary object.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function updateRoomSummary(roomId: string, summary: any): Promise<{success: boolean, error?: string}> {
  if (!roomId || !summary) {
    return { success: false, error: 'Room ID and summary are required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);

    await roomRef.update({
      summary: summary,
      lastActivityAt: FieldValue.serverTimestamp(),
    });

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION] Failed to update room summary for ${roomId}:`, error);
    return { success: false, error: 'Failed to update summary on the server.' };
  }
}

export async function generateTranscript(roomId: string, userId: string): Promise<{success: boolean, error?: string}> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room ID and User ID are required.' };
    }
     const settingsRef = db.collection('settings').doc('appConfig');
    const userRef = db.collection('users').doc(userId);

    const [settingsDoc, userDoc] = await Promise.all([settingsRef.get(), userRef.get()]);

    if (!userDoc.exists) return { success: false, error: 'User not found.' };
    
    const settings = settingsDoc.data();
    const userData = userDoc.data();
    const cost = settings?.transcriptCost ?? 50;

    if ((userData?.tokenBalance ?? 0) < cost) {
        return { success: false, error: 'Insufficient tokens to generate transcript.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    const messagesRef = roomRef.collection('messages').orderBy('createdAt');
    const participantsRef = roomRef.collection('participants');

    const [roomSnap, messagesSnap, participantsHistorySnap] = await Promise.all([
      roomRef.get(),
      messagesRef.get(),
      participantsRef.get(),
    ]);

    if (!roomSnap.exists) {
      return { success: false, error: `Room with ID ${roomId} not found.` };
    }
    
    const roomData = roomSnap.data() as SyncRoom;
    const messages = messagesSnap.docs.map(doc => doc.data() as RoomMessage);
    const participantHistory = participantsHistorySnap.docs.map(doc => doc.data() as Participant);
    
    const presentParticipantEmails = new Set(participantHistory.map(p => p.email));
    
    const allInvitedUsers: SummaryParticipant[] = [];
    if (roomData.invitedEmails && roomData.invitedEmails.length > 0) {
        const usersRef = db.collection('users');
        const invitedUsersQuery = usersRef.where('email', 'in', roomData.invitedEmails);
        const invitedUsersSnap = await invitedUsersQuery.get();
        const userDocsByEmail = new Map(invitedUsersSnap.docs.map(d => [d.data().email, d.data()]));
        const participantLanguageMap = new Map(participantHistory.map(p => [p.email, p.selectedLanguage]));

        roomData.invitedEmails.forEach((email: string) => {
            const userData = userDocsByEmail.get(email);
            const language = participantLanguageMap.get(email) || 'Not specified';
            allInvitedUsers.push({
                name: userData?.name || email.split('@')[0],
                email: email,
                language: language
            });
        });
    }
    
    const presentParticipants = allInvitedUsers.filter(p => presentParticipantEmails.has(p.email));
    const absentParticipants = allInvitedUsers.filter(p => !presentParticipantEmails.has(p.email));
    
    const transcript: Transcript = {
        title: roomData.topic,
        date: (roomData.createdAt as Timestamp).toDate().toISOString().split('T')[0],
        presentParticipants,
        absentParticipants,
        log: messages.map(msg => ({
            speakerName: msg.speakerName,
            text: msg.text,
            timestamp: (msg.createdAt as Timestamp).toDate().toISOString(),
        }))
    };

    const batch = db.batch();
    
    batch.update(roomRef, { transcript: transcript, status: 'closed' });
    
    batch.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
    
    const logRef = userRef.collection('transactionLogs').doc();
    batch.set(logRef, {
        actionType: 'live_sync_spend',
        tokenChange: -cost,
        timestamp: FieldValue.serverTimestamp(),
        description: `Generated transcript for room: ${roomData.topic}`
    });
    
    try {
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error generating transcript:", error);
        return { success: false, error: 'Failed to save transcript and update tokens.' };
    }
}


async function notifyAdmins(message: string, roomId: string) {
    const adminUids = await getAdminUids();
    if (adminUids.length > 0) {
        const batch = db.batch();
        for (const adminId of adminUids) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: adminId,
                type: 'edit_request',
                message: message,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
                roomId: roomId,
            });
        }
        await batch.commit();
    }
}


export async function requestSummaryEditAccess(roomId: string, roomTopic: string, userName: string): Promise<{success: boolean, error?: string}> {
    if (!roomId || !userName) {
        return { success: false, error: "Room ID and user name are required." };
    }
    try {
        await notifyAdmins(`${userName} is requesting to edit the summary for room "${roomTopic}".`, roomId);
        return { success: true };
    } catch (error: any) {
        console.error("Error requesting summary edit access:", error);
        return { success: false, error: "Failed to send notification to admins." };
    }
}

// The `updates.scheduledAt` is now an ISO string.
type RoomUpdatePayload = Omit<Partial<Pick<SyncRoom, 'topic' | 'durationMinutes' | 'invitedEmails' | 'emceeEmails'>>, 'scheduledAt'> & {
    scheduledAt?: string;
};

interface UpdateScheduledRoomPayload {
    roomId: string;
    userId: string;
    updates: RoomUpdatePayload,
    newCost: number;
}

export async function updateScheduledRoom(payload: UpdateScheduledRoomPayload): Promise<{success: boolean, error?: string}> {
    const { roomId, userId, updates, newCost } = payload;
    
    if (!roomId || !userId) return { success: false, error: "Room and User ID are required." };

    const roomRef = db.collection('syncRooms').doc(roomId);
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) throw new Error("Room not found.");
            
            const roomData = roomDoc.data() as SyncRoom;
            if (roomData.creatorUid !== userId) throw new Error("Only the room creator can edit a scheduled room.");
            if (roomData.status !== 'scheduled') throw new Error("Only scheduled rooms can be edited.");

            const oldCost = roomData.initialCost || 0;
            const costDifference = newCost - oldCost;

            const userDoc = await transaction.get(userRef);
            const userBalance = userDoc.data()?.tokenBalance || 0;
            
            if (userBalance < costDifference) {
                throw new Error(`Insufficient tokens. You need ${costDifference} more tokens for this change.`);
            }

            const { scheduledAt, ...otherUpdates } = updates;
            const updatePayload: Record<string, any> = {
                ...otherUpdates,
                initialCost: newCost,
                lastActivityAt: FieldValue.serverTimestamp()
            };

            // Convert ISO string back to Firestore Timestamp on the server
            if (scheduledAt) {
                updatePayload.scheduledAt = Timestamp.fromDate(new Date(scheduledAt));
            }

            transaction.update(roomRef, updatePayload);
            
            if (costDifference !== 0) {
                transaction.update(userRef, { tokenBalance: FieldValue.increment(-costDifference) });
                
                const logRef = userRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'live_sync_online_spend',
                    tokenChange: -costDifference,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Cost adjustment for editing scheduled room: "${roomData.topic}"`
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating scheduled room:", error);
        return { success: false, error: error.message || "An unexpected server error occurred." };
    }
}
    
export async function setRoomEditability(roomId: string, canEdit: boolean): Promise<{success: boolean; error?: string}> {
    if (!roomId) {
        return { success: false, error: 'Room ID is required.' };
    }

    try {
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists || !roomDoc.data()?.summary) {
            return { success: false, error: 'Room or summary not found.' };
        }

        // Use dot notation to update a nested field
        await roomRef.update({ 'summary.allowMoreEdits': canEdit });

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to set editability for room ${roomId}:`, error);
        return { success: false, error: 'Failed to update room editability on the server.' };
    }
}
