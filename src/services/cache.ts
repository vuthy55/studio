
"use client";

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { ClientVibe, ClientParty } from '@/lib/types';

const DB_NAME = 'VibeSyncCacheDB';
const STORE_NAME = 'common-room-cache';
const DB_VERSION = 1;
const CACHE_KEY = 'main';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface CommonRoomCache {
    version: number;
    timestamp: number;
    myVibes: ClientVibe[];
    publicVibes: ClientVibe[];
    myMeetups: ClientParty[];
    publicMeetups: ClientParty[];
    debugLog: string[];
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Retrieves cached Common Room data from IndexedDB, checking for version and timestamp.
 * @returns {Promise<CommonRoomCache | null>} The cached data or null if not found, outdated, or expired.
 */
export async function getCommonRoomCache(): Promise<CommonRoomCache | null> {
    try {
        const db = await getDb();
        const cachedData = await db.get(STORE_NAME, CACHE_KEY);

        if (cachedData) {
            const isVersionMatch = cachedData.version === DB_VERSION;
            const isNotExpired = (Date.now() - cachedData.timestamp) < CACHE_DURATION_MS;

            if (isVersionMatch && isNotExpired) {
                return cachedData;
            }
            
            // If data is outdated or version is mismatched, clear it and return null
            if (!isVersionMatch) console.warn(`Cache version mismatch. Expected ${DB_VERSION}, found ${cachedData.version}. Clearing cache.`);
            if (!isNotExpired) console.log("Cache expired. Fetching fresh data.");
            await db.delete(STORE_NAME, CACHE_KEY);
        }
        
        return null;

    } catch (error) {
        console.error("Error getting common room cache:", error);
        return null;
    }
}


/**
 * Saves fresh Common Room data to IndexedDB.
 * @param {Omit<CommonRoomCache, 'version' | 'timestamp'>} data - The data to cache.
 */
export async function setCommonRoomCache(data: Omit<CommonRoomCache, 'version' | 'timestamp'>): Promise<void> {
    try {
        const db = await getDb();
        const cachePayload: CommonRoomCache = {
            ...data,
            version: DB_VERSION,
            timestamp: Date.now(),
        };
        await db.put(STORE_NAME, cachePayload, CACHE_KEY);
    } catch (error) {
        console.error("Error setting common room cache:", error);
    }
}
