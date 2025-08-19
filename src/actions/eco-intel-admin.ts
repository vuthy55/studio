
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
 * Kicks off the AI Research Agent to build or update the intelligence database for a given country.
 * This function now only passes the country name to the self-contained AI flow.
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
        logMessage(`[START] Kicking off AI Research Agent for ${country.name}...`);
        const { ecoData, agentLog } = await discoverEcoIntel({ countryName: country.name });
        
        log.push(...agentLog);

        if (!ecoData) {
            throw new Error('AI Research Agent returned a null response. This can happen for countries with sensitive or unavailable data.');
        }

        if (!ecoData.countryName) {
            throw new Error('AI Research Agent failed to return the country name in its data.');
        }
        
        logMessage(`[INFO] Saving analyzed data to Firestore...`);
        
        const finalData = {
            ...ecoData,
            id: country.code,
            countryName: country.name,
            lastBuildStatus: 'success' as const,
            lastBuildAt: FieldValue.serverTimestamp(),
            lastBuildError: null
        };

        // Before saving, ensure the structure matches CountryEcoIntel
        if (finalData.offsettingOpportunities) {
            (finalData as any).offsettingOpportunities = finalData.offsettingOpportunities.map(o => ({
                name: o.name,
                responsibility: o.responsibility, // This field is in the AI output
                url: o.url,
                activityType: o.activityType,
            }));
        }

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
