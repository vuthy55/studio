
'use server';

import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-admin'; 
import type { SyncRoom } from '@/lib/types';

// We create a specific type for returning to the client to avoid serialization issues with Timestamps.
export interface ClientSyncRoom extends Omit<SyncRoom, 'id' | 'createdAt' | 'lastActivityAt'> {
    id: string;
    topic: string;
    status: 'active' | 'closed';
    createdAt: string; 
    lastActivityAt?: string;
}

/**
 * Fetches all rooms from Firestore for admin/testing purposes.
 * This is a server action that uses the Firebase Admin SDK.
 * @returns {Promise<ClientSyncRoom[]>} A promise that resolves to an array of all rooms.
 */
export async function getAllRooms(): Promise<ClientSyncRoom[]> {
  try {
    const roomsCol = collection(db, 'syncRooms');
    const q = query(roomsCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        console.log("No rooms found.");
        return [];
    }
    
    const rooms = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        // Convert Timestamps to ISO strings for safe serialization to the client.
        return {
            ...data,
            id: docSnapshot.id,
            topic: data.topic,
            status: data.status,
            createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
            lastActivityAt: (data.lastActivityAt as Timestamp)?.toDate().toISOString() || undefined,
        } as ClientSyncRoom;
    });

    return rooms;

  } catch (error) {
    console.error("Error in getAllRooms server action:", error);
    // In case of an error, return an empty array to prevent the client from crashing.
    return [];
  }
}
