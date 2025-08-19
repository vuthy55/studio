
'use server';

import { db } from '@/lib/firebase-admin';
import type { CountryEcoIntel } from '@/lib/types';
import { discoverEcoIntel } from '@/ai/flows/discover-eco-intel-flow';
import { lightweightCountries } from '@/lib/location-data';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { searchWebAction } from '@/actions/search';


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
 * This server action now handles all data gathering before passing it to the AI flow.
 */
export async function buildEcoIntelData(countryCode: string): Promise<{success: boolean, log: string[], error?: string}> {
    const log: string[] = [];
    const logMessage = (message: string) => log.push(message);

    const country = lightweightCountries.find(c => c.code === countryCode);
    if (!country) {
        const errorMsg = 'Country not found.';
        logMessage(`[FAIL] ${errorMsg}`);
        return { success: false, log, error: errorMsg };
    }

    const docRef = db.collection('countryEcoIntel').doc(country.code);

    try {
        logMessage(`[START] Starting Eco-Intel build for ${country.name}.`);
        logMessage(`[INFO] Stage 1: Compiling queries...`);
        const queries = [
            `(ministry OR department OR agency) of (environment OR forestry OR climate change) official site in ${country.name}`,
            `top environmental NGOs for (tree planting OR conservation OR recycling) in ${country.name}`,
            `carbon offsetting programs in ${country.name}`,
            `eco-tourism opportunities in ${country.name}`
        ];

        let researchPacket = "";

        logMessage(`[INFO] Stage 2: Gathering data from web searches...`);
        for (const query of queries) {
            logMessage(`[INFO] ...searching for: "${query}"`);
            const searchResult = await searchWebAction({ query });
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                const snippets = searchResult.results.map(r => `Source: ${r.link}\nTitle: ${r.title}\nSnippet: ${r.snippet}`).join('\n\n');
                researchPacket += `--- Results for query: "${query}" ---\n${snippets}\n\n`;
            }
        }

        if (!researchPacket.trim()) {
            throw new Error('Web search returned no usable information.');
        }

        logMessage(`[INFO] Stage 3: Passing research packet to AI for analysis...`);
        const ecoData = await discoverEcoIntel({ countryName: country.name, researchPacket: researchPacket });
        
        if (!ecoData || !ecoData.countryName) {
            throw new Error('AI Research Agent failed to return sufficient data.');
        }
        
        // --- SECONDARY DATA SANITIZATION (DEFENSIVE) ---
        // This is a robust fallback to ensure data integrity even if the AI flow's sanitization fails.
        if (ecoData.ecoTourismOpportunities) {
            ecoData.ecoTourismOpportunities.forEach(opp => {
                if (opp.bookingUrl === "") {
                    delete opp.bookingUrl;
                }
            });
        }
        // --- END SANITIZATION ---


        logMessage(`[INFO] Stage 4: Saving analyzed data to Firestore...`);
        const finalData = {
            ...ecoData,
            id: country.code,
            countryName: country.name,
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
