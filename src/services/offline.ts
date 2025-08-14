
"use client";

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { LanguageCode } from '@/lib/data';
import type { AudioPack } from '@/lib/types';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const METADATA_STORE_NAME = 'AudioPackMetadata';
const DB_VERSION = 2;
const SAVED_PHRASES_KEY = 'user_saved_phrases';

export interface PackMetadata {
  id: string; // e.g., 'khmer' or 'user_saved_phrases'
  phraseCount?: number;
  size: number;
}

// --- Singleton Database Initialization ---
// This robust singleton pattern prevents race conditions during app startup.
let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // This logic is resilient to both initial creation and upgrades.
        // It checks for the existence of each object store and creates it if missing.
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}
// --- End Singleton Initialization ---


export async function getOfflineAudio(lang: LanguageCode | 'user_saved_phrases'): Promise<AudioPack | undefined> {
    const db = await getDb();
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
