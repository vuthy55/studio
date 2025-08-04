
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

        const promises = chunks.map(chunk => intelRef.where('id', 'in', chunk).get());
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

const seedData: Omit<CountryIntelData, 'id'>[] = [
    { countryName: 'Brunei', region: 'South East Asia', neighbours: ['MY'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['thebruneian.news', 'borneobulletin.com.bn'] },
    { countryName: 'Cambodia', region: 'South East Asia', neighbours: ['TH', 'VN', 'LA'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['phnompenhpost.com', 'khmertimeskh.com', 'cambodianess.com'] },
    { countryName: 'Indonesia', region: 'South East Asia', neighbours: ['MY', 'PG', 'TL'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['thejakartapost.com', 'en.tempo.co', 'antaranews.com'] },
    { countryName: 'Laos', region: 'South East Asia', neighbours: ['TH', 'VN', 'KH', 'MM', 'CN'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['laotiantimes.com', 'vientianetimes.org.la'] },
    { countryName: 'Malaysia', region: 'South East Asia', neighbours: ['TH', 'ID', 'BN', 'SG'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['thestar.com.my', 'malaysiakini.com', 'freemalaysiatoday.com'] },
    { countryName: 'Myanmar', region: 'South East Asia', neighbours: ['TH', 'LA', 'CN', 'IN', 'BD'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['irrawaddy.com', 'frontiermyanmar.net', 'mmtimes.com'] },
    { countryName: 'Philippines', region: 'South East Asia', neighbours: [], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['rappler.com', 'inquirer.net', 'philstar.com'] },
    { countryName: 'Singapore', region: 'South East Asia', neighbours: ['MY', 'ID'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['straitstimes.com', 'todayonline.com', 'channelnewsasia.com'] },
    { countryName: 'Thailand', region: 'South East Asia', neighbours: ['MY', 'KH', 'LA', 'MM'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['bangkokpost.com', 'nationthailand.com', 'thaipbsworld.com'] },
    { countryName: 'Vietnam', region: 'South East Asia', neighbours: ['KH', 'LA', 'CN'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['vnexpress.net', 'tuoitrenews.vn', 'vir.com.vn'] },
    { countryName: 'Timor-Leste', region: 'South East Asia', neighbours: ['ID'], regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'], localNews: ['tatoli.tl'] }
];


/**
 * The "Database Builder" function. Iterates through a given list of country codes (or all if none provided),
 * discovers data for those not already in Firestore, and saves it.
 * It will auto-seed with core ASEAN data if the collection is empty.
 */
export async function buildCountryIntelData(countryCodes?: string[]): Promise<{ success: boolean; error?: string; totalToProcess?: number; addedCount?: number }> {
    try {
        console.log('[Intel Builder] Starting database build process...');
        const intelCollectionRef = db.collection('countryIntelCache');
        const existingDocsSnapshot = await intelCollectionRef.get();
        
        let shouldSeed = existingDocsSnapshot.empty;
        
        // Auto-seed if the database is completely empty
        if (shouldSeed) {
            console.log('[Intel Builder] Database is empty. Seeding with core ASEAN data...');
            const batch = db.batch();
            for (const country of seedData) {
                const countryInfo = lightweightCountries.find(c => c.name === country.countryName);
                if (countryInfo) {
                    const docRef = intelCollectionRef.doc(countryInfo.code);
                    batch.set(docRef, { ...country, id: countryInfo.code });
                }
            }
            await batch.commit();
            console.log('[Intel Builder] Core data seeded.');
        }

        // Determine which countries to process
        const updatedSnapshot = shouldSeed ? await intelCollectionRef.get() : existingDocsSnapshot;
        const existingCountryCodes = new Set(updatedSnapshot.docs.map(doc => doc.id));
        
        const allCountriesToConsider = countryCodes 
            ? lightweightCountries.filter(c => countryCodes.includes(c.code))
            : lightweightCountries;
            
        const countriesToProcess = allCountriesToConsider.filter(c => !existingCountryCodes.has(c.code));
        
        if (countriesToProcess.length === 0) {
            console.log('[Intel Builder] No new countries to process from the provided list.');
            return { success: true, totalToProcess: 0, addedCount: 0 };
        }

        console.log(`[Intel Builder] Found ${countriesToProcess.length} new countries to process.`);
        
        let addedCount = 0;
        for (const country of countriesToProcess) {
            try {
                console.log(`[Intel Builder] Discovering data for ${country.name}...`);
                const intelData = await discoverCountryData({ countryName: country.name });
                
                if (intelData && intelData.region && intelData.countryName) {
                    const docRef = intelCollectionRef.doc(country.code);
                    await docRef.set({
                        ...intelData,
                        id: country.code // Ensure the ID is the country code
                    });
                    addedCount++;
                    console.log(`[Intel Builder] Successfully added ${country.name}.`);
                } else {
                     console.warn(`[Intel Builder] AI failed to return sufficient data for ${country.name}. Skipping.`);
                }
            } catch (aiError) {
                console.error(`[Intel Builder] Error processing ${country.name}:`, aiError);
                // Continue to the next country even if one fails
            }
        }
        
        console.log(`[Intel Builder] Process finished. Added ${addedCount} new countries.`);
        return { success: true, totalToProcess: countriesToProcess.length, addedCount };

    } catch (error: any) {
        console.error('[Intel Builder] Critical error during database build:', error);
        return { success: false, error: 'A critical server error occurred.' };
    }
}
