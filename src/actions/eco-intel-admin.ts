
'use server';

import { db } from '@/lib/firebase-admin';
import type { CountryEcoIntel } from '@/lib/types';
import { discoverEcoIntel } from '@/ai/flows/discover-eco-intel-flow';
import { lightweightCountries } from '@/lib/location-data';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


/**
 * Fetches all country eco-intel documents from Firestore for the admin dashboard.
 */
export async function getEcoIntelAdmin(): Promise<CountryEcoIntel[]> {
    try {
        const snapshot = await db.collection('countryEcoIntel').orderBy('countryName').get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => {
            const data = doc.data();
            const lastBuildAt = (data.lastBuildAt as Timestamp)?.toDate().toISOString();
            return { 
                id: doc.id, 
                ...data,
                lastBuildAt
            } as CountryEcoIntel;
        });
    } catch (error) {
        console.error("Error fetching all country eco intel data:", error);
        return [];
    }
}

/**
 * Updates a specific country's eco-intel document in Firestore.
 */
export async function updateEcoIntelAdmin(countryCode: string, updates: Partial<CountryEcoIntel>): Promise<{ success: boolean; error?: string }> {
    if (!countryCode) return { success: false, error: 'Country code is required.' };
    
    try {
        const docRef = db.collection('countryEcoIntel').doc(countryCode);
        await docRef.update(updates);
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating eco-intel for ${countryCode}:`, error);
        return { success: false, error: 'Failed to update data on the server.' };
    }
}

/**
 * Builds or updates the intelligence database for a given country.
 * This is now the main server action that orchestrates the entire AI research process.
 */
export async function buildEcoIntelData(countryCode: string): Promise<{success: boolean, log: string[], error?: string}> {
    const log: string[] = [];
    const country = lightweightCountries.find(c => c.code === countryCode);
    if (!country) {
        const errorMsg = 'Country not found.';
        log.push(`[FAIL] ${errorMsg}`);
        return { success: false, log, error: errorMsg };
    }

    const docRef = db.collection('countryEcoIntel').doc(country.code);
    const logMessage = (message: string) => log.push(message);

    try {
        logMessage(`[START] Kicking off AI Research Agent for ${country.name}...`);
        const ecoData = await discoverEcoIntel({ countryName: country.name }, logMessage);
        
        if (!ecoData || !ecoData.countryName) {
            throw new Error('AI Research Agent failed to return sufficient data.');
        }

        logMessage(`[INFO] Saving analyzed data to Firestore...`);
        const finalData = {
            ...ecoData,
            id: country.code,
            countryName: country.name, // Ensure countryName is always correct
            lastBuildStatus: 'success' as const,
            lastBuildAt: FieldValue.serverTimestamp(),
            lastBuildError: null
        };
        await docRef.set(finalData, { merge: true });

        logMessage(`[SUCCESS] Build for ${country.name} completed successfully.`);
        return { success: true, log };
    } catch (error: any) {
        logMessage(`[CRITICAL] CRITICAL ERROR processing ${country.name}: ${error.message}`);
        await docRef.set({
            countryName: country.name,
            id: country.code,
            lastBuildStatus: 'failed' as const,
            lastBuildError: error.message || 'An unknown error occurred during AI discovery.',
            lastBuildAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: false, log, error: error.message };
    }
}
