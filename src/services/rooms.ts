

'use server';

import { db } from '@/lib/firebase-admin'; 
import type { SyncRoom } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

// We create a specific type for returning to the client to avoid serialization issues with Timestamps.
export interface ClientSyncRoom extends Omit<SyncRoom, 'id' | 'createdAt' | 'lastActivityAt' | 'scheduledAt'> {
    id: string;
    topic: string;
    status: 'active' | 'closed' | 'scheduled';
    createdAt?: string; 
    lastActivityAt?: string;
    scheduledAt?: string;
}

/**
 * Fetches all rooms from Firestore for admin/testing purposes.
 * This is a server action that uses the Firebase Admin SDK.
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

    const rooms = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();

        // Helper to safely convert a Firestore Timestamp (in any of its forms) to an ISO string
        const toISO = (ts: any): string | undefined => {
            if (!ts) return undefined;
            // Case 1: It's already an ISO string that is valid
            if (typeof ts === 'string' && !isNaN(new Date(ts).getTime())) {
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
            // If none of the above, we can't convert it.
            return undefined;
        };
        
        return {
            ...data,
            id: docSnapshot.id,
            topic: data.topic,
            status: data.status,
            createdAt: toISO(data.createdAt),
            lastActivityAt: toISO(data.lastActivityAt),
            scheduledAt: toISO(data.scheduledAt),
        } as ClientSyncRoom;
    });

    return rooms;

  } catch (error) {
    console.error("[SERVER ACTION] Error in getAllRooms:", error);
    // In case of an error, return an empty array to prevent the client from crashing.
    return [];
  }
}
