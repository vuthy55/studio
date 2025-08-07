

'use server';

import { db } from '@/lib/firebase-admin'; 
import type { SyncRoom } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

// We create a specific type for returning to the client to avoid serialization issues with Timestamps.
export interface ClientSyncRoom extends Omit<SyncRoom, 'id' | 'createdAt' | 'lastActivityAt' | 'scheduledAt' | 'firstMessageAt' | 'effectiveEndTime'> {
    id: string;
    topic: string;
    status: 'active' | 'closed' | 'scheduled';
    createdAt?: string; 
    lastActivityAt?: string;
    scheduledAt?: string;
    firstMessageAt?: string;
    effectiveEndTime?: string;
}

/**
 * Fetches all rooms from Firestore for admin/testing purposes.
 * This is a server action that uses the Firebase Admin SDK.
 * This is a more robust version that handles potential data inconsistencies.
 * @returns {Promise<ClientSyncRoom[]>} A promise that resolves to an array of all rooms.
 */
export async function getAllRooms(): Promise<ClientSyncRoom[]> {
  console.log("[SERVER ACTION] getAllRooms invoked.");
  try {
    const roomsCol = db.collection('syncRooms');
    const q = roomsCol.orderBy('createdAt', 'desc');
    const snapshot = await q.get();

    if (snapshot.empty) {
        console.log("[SERVER ACTION] No rooms found in 'syncRooms' collection.");
        return [];
    }
    
    console.log(`[SERVER ACTION] Found ${snapshot.size} room(s).`);

    const rooms: ClientSyncRoom[] = [];
    
    for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();

        // Helper to safely convert a Firestore Timestamp (in any of its forms) to an ISO string
        const toISO = (ts: any): string | undefined => {
            try {
                if (!ts) return undefined;
                // Case 1: It's already a valid ISO string
                if (typeof ts === 'string' && new Date(ts).toISOString() === ts) {
                    return ts;
                }
                // Case 2: It's a Firestore Timestamp object
                if (ts instanceof Timestamp) {
                    return ts.toDate().toISOString();
                }
                 // Case 3: It's a plain object with seconds/nanoseconds (from client-side conversion)
                if (ts && typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
                     return new Timestamp(ts.seconds, ts.nanoseconds).toDate().toISOString();
                }
                // If none of the above, we can't safely convert it.
                console.warn(`[getAllRooms] Could not convert timestamp for doc ${docSnapshot.id}:`, ts);
                return undefined;
            } catch (e) {
                 console.error(`[getAllRooms] Error converting timestamp for doc ${docSnapshot.id}:`, e);
                return undefined;
            }
        };
        
        // Construct the room object defensively
        const room: ClientSyncRoom = {
            id: docSnapshot.id,
            topic: data.topic || 'Untitled Room',
            creatorUid: data.creatorUid || '',
            creatorName: data.creatorName || 'Unknown Creator',
            status: data.status || 'closed',
            invitedEmails: data.invitedEmails || [],
            emceeEmails: data.emceeEmails || [],
            blockedUsers: data.blockedUsers || [],
            summary: data.summary,
            transcript: data.transcript,
            durationMinutes: data.durationMinutes,
            initialCost: data.initialCost,
            paymentLogId: data.paymentLogId,
            hasStarted: data.hasStarted || false,
            reminderMinutes: data.reminderMinutes,
            createdAt: toISO(data.createdAt),
            lastActivityAt: toISO(data.lastActivityAt),
            scheduledAt: toISO(data.scheduledAt),
            firstMessageAt: toISO(data.firstMessageAt),
            effectiveEndTime: toISO(data.effectiveEndTime),
        };

        rooms.push(room);
    }

    return rooms;

  } catch (error) {
    console.error("[SERVER ACTION] Error in getAllRooms:", error);
    // In case of an error, return an empty array to prevent the client from crashing.
    return [];
  }
}
