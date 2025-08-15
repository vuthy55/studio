
'use server';

import { db } from '@/lib/firebase-admin';
import type { CountryTransportData } from '@/lib/types';
import { discoverTransportProviders } from '@/ai/flows/discover-transport-providers-flow';
import { lightweightCountries } from '@/lib/location-data';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


/**
 * Fetches all country transport documents from Firestore for the admin dashboard.
 */
export async function getTransportDataAdmin(): Promise<CountryTransportData[]> {
    try {
        const snapshot = await db.collection('countryTransport').orderBy('countryName').get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => {
            const data = doc.data();
            const lastBuildAt = (data.lastBuildAt as Timestamp)?.toDate().toISOString();
            return { 
                id: doc.id, 
                ...data,
                lastBuildAt
            } as CountryTransportData;
        });
    } catch (error) {
        console.error("Error fetching all country transport data:", error);
        return [];
    }
}

/**
 * Updates a specific country's transport document in Firestore.
 */
export async function updateTransportDataAdmin(countryCode: string, updates: Partial<CountryTransportData>): Promise<{ success: boolean; error?: string }> {
    if (!countryCode) return { success: false, error: 'Country code is required.' };
    
    try {
        const docRef = db.collection('countryTransport').doc(countryCode);
        await docRef.update(updates);
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating transport data for ${countryCode}:`, error);
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
 * Builds or updates the transport provider database for a given list of country codes.
 */
export async function buildTransportData(countryCodesToBuild: string[]): Promise<{ success: boolean; results: BuildResult[] }> {
    if (!countryCodesToBuild || countryCodesToBuild.length === 0) {
        return { success: false, results: [] };
    }

    const collectionRef = db.collection('countryTransport');
    const countriesToProcess = lightweightCountries.filter(c => countryCodesToBuild.includes(c.code));
    
    const buildPromises = countriesToProcess.map(async (country): Promise<BuildResult> => {
        const docRef = collectionRef.doc(country.code);
        try {
            console.log(`[Transport Builder] Discovering providers for ${country.name}...`);
            const transportData = await discoverTransportProviders({ countryName: country.name });
            
            if (transportData && transportData.countryName) {
                await docRef.set({
                    ...transportData,
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
            console.error(`[Transport Builder] Error processing ${country.name}:`, error);
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
