

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

interface BuildResult {
    countryCode: string;
    countryName: string;
    status: 'success' | 'failed';
    error?: string;
}

/**
 * Builds or updates the eco-intel database for a given list of country codes.
 */
export async function buildEcoIntelData(countryCodesToBuild: string[]): Promise<{ success: boolean; results: BuildResult[] }> {
    if (!countryCodesToBuild || countryCodesToBuild.length === 0) {
        return { success: false, results: [] };
    }

    const collectionRef = db.collection('countryEcoIntel');
    const countriesToProcess = lightweightCountries.filter(c => countryCodesToBuild.includes(c.code));
    
    const buildPromises = countriesToProcess.map(async (country): Promise<BuildResult> => {
        const docRef = collectionRef.doc(country.code);
        try {
            console.log(`[Eco Intel Builder] Discovering data for ${country.name}...`);
            const ecoData = await discoverEcoIntel({ countryName: country.name });
            
            if (ecoData && ecoData.countryName) {
                await docRef.set({
                    ...ecoData,
                    id: country.code,
                    lastBuildStatus: 'success',
                    lastBuildAt: FieldValue.serverTimestamp(),
                    lastBuildError: null
                });
                return { status: 'success', countryCode: country.code, countryName: country.name };
            } else {
                 throw new Error(`AI failed to return sufficient data.`);
            }
        } catch (error: any) {
            console.error(`[Eco Intel Builder] Error processing ${country.name}:`, error);
            await docRef.set({
                countryName: country.name,
                id: country.code,
                lastBuildStatus: 'failed',
                lastBuildError: error.message || 'An unknown error occurred during AI discovery.',
                lastBuildAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            return { status: 'failed', countryCode: country.code, countryName: country.name, error: error.message };
        }
    });

    const results = await Promise.all(buildPromises);
    
    return { success: true, results };
}
