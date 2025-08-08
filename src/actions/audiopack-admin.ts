

'use server';

import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { phrasebook, type LanguageCode } from '@/lib/data';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';

export interface LanguagePackMetadata {
    id: LanguageCode;
    name: string;
    size: number;
}

export interface LanguagePackGenerationMetadata {
    id: LanguageCode;
    name: string;
    generatedCount: number;
    totalCount: number;
    lastGeneratedAt: string; // ISO String
}


const METADATA_FOLDER = 'audio-packs-metadata';


export async function saveGenerationMetadata(metadata: LanguagePackGenerationMetadata) {
    try {
        const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
        const fileName = `${METADATA_FOLDER}/${metadata.id}.json`;
        const file = bucket.file(fileName);
        await file.save(JSON.stringify(metadata), {
            contentType: 'application/json',
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error saving metadata for ${metadata.id}:`, error);
        return { success: false, error: 'Failed to save generation metadata.' };
    }
}

export async function getGenerationMetadata(): Promise<LanguagePackGenerationMetadata[]> {
    try {
        const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
        const [files] = await bucket.getFiles({ prefix: `${METADATA_FOLDER}/` });
        
        const metadataPromises = files.map(async (file) => {
            if (file.name.endsWith('/')) return null;
            
            const [contents] = await file.download();
            try {
                return JSON.parse(contents.toString());
            } catch (e) {
                console.error(`Failed to parse metadata for ${file.name}:`, e);
                return null;
            }
        });

        const allMetadata = (await Promise.all(metadataPromises)).filter(Boolean);
        return allMetadata as LanguagePackGenerationMetadata[];

    } catch (error) {
        console.error("Error fetching generation metadata:", error);
        return [];
    }
}


const freePacksDocRef = db.collection('settings').doc('freeLanguagePacks');

export async function getFreeLanguagePacks(): Promise<LanguageCode[]> {
    try {
        const docSnap = await freePacksDocRef.get();
        if (docSnap.exists) {
            return docSnap.data()?.codes || [];
        }
        return [];
    } catch (error) {
        console.error("Error getting free language packs:", error);
        return [];
    }
}

export async function setFreeLanguagePacks(codes: LanguageCode[]): Promise<{success: boolean, error?: string}> {
    try {
        await freePacksDocRef.set({ codes });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting free language packs:", error);
        return { success: false, error: 'Failed to update free packs list.' };
    }
}

export async function applyFreeLanguagesToAllUsers(): Promise<{success: boolean, error?: string}> {
    try {
        const freePacks = await getFreeLanguagePacks();
        if (freePacks.length === 0) {
            return { success: true };
        }
        
        const usersRef = db.collection('users');
        const usersSnapshot = await usersRef.get();
        
        const batchPromises = [];
        let batch = db.batch();
        let count = 0;

        for (const userDoc of usersSnapshot.docs) {
            batch.update(userDoc.ref, {
                unlockedLanguages: FieldValue.arrayUnion(...freePacks),
                downloadedPacks: FieldValue.arrayUnion(...freePacks),
            });
            count++;
            if (count === 499) {
                batchPromises.push(batch.commit());
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            batchPromises.push(batch.commit());
        }

        await Promise.all(batchPromises);
        
        return { success: true };
    } catch (error: any) {
        console.error("Error applying free languages to all users:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
