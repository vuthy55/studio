
"use client";

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { LanguageCode } from '@/lib/data';
import type { AudioPack } from '@/lib/types';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const METADATA_STORE_NAME = 'AudioPackMetadata';
const DB_VERSION = 2;

export interface PackMetadata {
  id: string; // e.g., 'khmer' or 'user_saved_phrases'
  phraseCount?: number;
  size: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  console.log(`[DEBUG] offline.ts: getDb() called at ${new Date().toISOString()}`);
  if (!dbPromise) {
    console.log(`[DEBUG] offline.ts: getDb() - No existing dbPromise. Creating new one at ${new Date().toISOString()}`);
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`[DEBUG] offline.ts: openDB upgrade() callback executing. Old: ${oldVersion}, New: ${newVersion}`);
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          console.log(`[DEBUG] offline.ts: Creating object store: ${STORE_NAME}`);
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          console.log(`[DEBUG] offline.ts: Creating object store: ${METADATA_STORE_NAME}`);
          db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
        }
        console.log(`[DEBUG] offline.ts: openDB upgrade() callback finished.`);
      },
      blocked() {
        // This event fires if there are other connections to the same database that are preventing it from being upgraded.
        console.error("[CRITICAL DEBUG] offline.ts: openDB blocked event fired. Another tab may be holding the connection open.");
        alert("VibeSync database is blocked. Please close all other VibeSync tabs and refresh.");
      },
      blocking() {
        // This event fires on the "older" connection when it's blocking a newer version from opening.
        console.warn("[DEBUG] offline.ts: This tab is blocking a newer database version from opening.");
      }
    });
    console.log(`[DEBUG] offline.ts: openDB promise created at ${new Date().toISOString()}`);
  } else {
    console.log(`[DEBUG] offline.ts: getDb() - Returning existing dbPromise at ${new Date().toISOString()}`);
  }
  return dbPromise;
}

export async function ensureDbReady(): Promise<void> {
    console.log(`[DEBUG] offline.ts: ensureDbReady() called at ${new Date().toISOString()}`);
    try {
        const db = await getDb();
        console.log(`[DEBUG] offline.ts: DB Promise resolved in ensureDbReady. Database is ready at ${new Date().toISOString()}`);
    } catch (e) {
        console.error(`[DEBUG] offline.ts: ensureDbReady() caught an error.`, e);
    }
    console.log(`[DEBUG] offline.ts: ensureDbReady() finished at ${new Date().toISOString()}`);
}

export async function getOfflineAudio(lang: LanguageCode | 'user_saved_phrases'): Promise<AudioPack | undefined> {
    console.log(`[DEBUG] offline.ts: getOfflineAudio() called for '${lang}' at ${new Date().toISOString()}`);
    const db = await getDb();
    console.log(`[DEBUG] offline.ts: getOfflineAudio() for '${lang}' got DB instance. Calling db.get() at ${new Date().toISOString()}`);
    return db.get(STORE_NAME, lang);
}


export async function loadSingleOfflinePack(lang: LanguageCode | 'user_saved_phrases', audioPack: AudioPack, size: number): Promise<void> {
    const db = await getDb();
    const tx = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(METADATA_STORE_NAME);

    const metadata: PackMetadata = { id: lang, size };
    
    await Promise.all([
      store.put(audioPack, lang),
      metaStore.put(metadata)
    ]);
    
    await tx.done;
}


export async function removeOfflinePack(lang: LanguageCode | 'user_saved_phrases'): Promise<void> {
    const db = await getDb();
    const tx = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(METADATA_STORE_NAME);

    await Promise.all([
      store.delete(lang),
      metaStore.delete(lang)
    ]);

    await tx.done;
}


export async function getOfflineMetadata(): Promise<PackMetadata[]> {
    const db = await getDb();
    return db.getAll(METADATA_STORE_NAME);
}
