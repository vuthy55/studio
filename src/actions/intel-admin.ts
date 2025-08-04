
'use server';

import { db } from '@/lib/firebase-admin';
import type { CountryIntelData } from '@/lib/types';
import { discoverCountryData } from '@/ai/flows/discover-country-data-flow';
import { lightweightCountries } from '@/lib/location-data';


/**
 * Fetches the intelligence data for a single country by its unique country code.
 * @param countryCode The ISO 3166-1 alpha-2 code of the country (e.g., "KH").
 * @returns {Promise<CountryIntelData | null>}
 */
export async function getCountryIntelData(countryCode: string): Promise<CountryIntelData | null> {
    try {
        if (!countryCode) return null;
        
        const intelDocRef = db.collection('countryIntelCache').doc(countryCode);
        const doc = await intelDocRef.get();

        if (!doc.exists) {
            return null;
        }

        return {
            id: doc.id,
            ...doc.data()
        } as CountryIntelData;

    } catch (error) {
        console.error(`Error fetching intel data for ${countryCode}:`, error);
        return null;
    }
}

/**
 * Fetches intel data for a list of neighboring country codes.
 * @param neighbourCodes An array of country codes (e.g., ['TH', 'VN']).
 * @returns {Promise<CountryIntelData[]>}
 */
export async function getNeighborIntelData(neighbourCodes: string[]): Promise<CountryIntelData[]> {
    if (!neighbourCodes || neighbourCodes.length === 0) {
        return [];
    }
    
    try {
        const intelRef = db.collection('countryIntelCache');
        // Firestore 'in' queries are limited to 30 items per query.
        // We chunk the requests to handle any number of neighbors.
        const chunks: string[][] = [];
        for (let i = 0; i < neighbourCodes.length; i += 30) {
            chunks.push(neighbourCodes.slice(i, i + 30));
        }

        const promises = chunks.map(chunk => intelRef.where('__name__', 'in', chunk).get());
        const snapshots = await Promise.all(promises);

        const neighbors: CountryIntelData[] = [];
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                neighbors.push({
                    id: doc.id,
                    ...doc.data()
                } as CountryIntelData);
            });
        });

        return neighbors;
    } catch (error) {
        console.error("Error fetching neighbor intel data:", error);
        return [];
    }
}


/**
 * Fetches all country intel documents from Firestore for the admin dashboard.
 */
export async function getCountryIntelAdmin(): Promise<CountryIntelData[]> {
    try {
        const snapshot = await db.collection('countryIntelCache').orderBy('countryName').get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CountryIntelData));
    } catch (error) {
        console.error("Error fetching all country intel data:", error);
        return [];
    }
}

/**
 * Updates a specific country's intel document in Firestore.
 */
export async function updateCountryIntelAdmin(countryCode: string, updates: Partial<CountryIntelData>): Promise<{ success: boolean; error?: string }> {
    if (!countryCode) return { success: false, error: 'Country code is required.' };
    
    try {
        const docRef = db.collection('countryIntelCache').doc(countryCode);
        await docRef.update(updates);
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating intel for ${countryCode}:`, error);
        return { success: false, error: 'Failed to update data on the server.' };
    }
}

/**
 * Builds or updates the intelligence database for a given list of country codes.
 * If a document already exists for a country code, it will be OVERWRITTEN.
 * @param countryCodesToBuild An array of ISO 3166-1 alpha-2 country codes.
 */
export async function buildCountryIntelData(countryCodesToBuild: string[]): Promise<{ success: boolean; error?: string; totalToProcess?: number; addedCount?: number }> {
    if (!countryCodesToBuild || countryCodesToBuild.length === 0) {
        return { success: false, error: "No country codes provided to build." };
    }

    try {
        console.log(`[Intel Builder] Starting database build/update process for ${countryCodesToBuild.length} countries.`);
        const intelCollectionRef = db.collection('countryIntelCache');

        const countriesToProcess = lightweightCountries.filter(c => countryCodesToBuild.includes(c.code));
        
        if (countriesToProcess.length === 0) {
            console.warn('[Intel Builder] No matching countries found in lightweightCountries list for the provided codes.');
            return { success: true, totalToProcess: 0, addedCount: 0 };
        }

        console.log(`[Intel Builder] Processing ${countriesToProcess.length} countries.`);
        
        let addedCount = 0;
        // Using Promise.allSettled to process countries and not fail the entire batch if one fails.
        const results = await Promise.allSettled(countriesToProcess.map(async (country) => {
            console.log(`[Intel Builder] Discovering data for ${country.name}...`);
            const intelData = await discoverCountryData({ countryName: country.name });
            
            if (intelData && intelData.region && intelData.countryName) {
                const docRef = intelCollectionRef.doc(country.code);
                // Using set with merge:false will create or completely overwrite the document.
                await docRef.set({
                    ...intelData,
                    id: country.code // Ensure the ID is the country code
                });
                return { status: 'fulfilled', country: country.name };
            } else {
                 throw new Error(`AI failed to return sufficient data for ${country.name}.`);
            }
        }));
        
        results.forEach((result, index) => {
            const countryName = countriesToProcess[index].name;
            if (result.status === 'fulfilled') {
                addedCount++;
                console.log(`[Intel Builder] Successfully built/updated data for ${countryName}.`);
            } else {
                 console.error(`[Intel Builder] Error processing ${countryName}:`, result.reason);
            }
        });
        
        console.log(`[Intel Builder] Process finished. Successfully processed ${addedCount} of ${countriesToProcess.length} countries.`);
        return { success: true, totalToProcess: countriesToProcess.length, addedCount };

    } catch (error: any) {
        console.error('[Intel Builder] Critical error during database build:', error);
        return { success: false, error: 'A critical server error occurred.' };
    }
}
