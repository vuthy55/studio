'use server';
/**
 * @fileOverview A server action for fetching public country intelligence data.
 * This file is intended for client-side components and provides a secure
 * way to access pre-built country intel from the database.
 */
import { db } from '@/lib/firebase-admin';
import type { CountryIntelData } from '@/lib/types';
import type { Timestamp } from 'firebase-admin/firestore';


/**
 * Fetches the intelligence data for a single country by its unique country code.
 * This version is intended for public, client-side use.
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
        
        const data = doc.data();
        if (!data) return null;
        
        // Convert timestamp to serializable format
        const lastBuildAt = (data.lastBuildAt as Timestamp)?.toDate().toISOString();

        return {
            id: doc.id,
            ...data,
            lastBuildAt,
        } as CountryIntelData;

    } catch (error) {
        console.error(`Error fetching intel data for ${countryCode}:`, error);
        return null;
    }
}
