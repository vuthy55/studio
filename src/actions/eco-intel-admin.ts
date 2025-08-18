

'use server';

import { db } from '@/lib/firebase-admin';
import type { CountryEcoIntel } from '@/lib/types';
import { discoverEcoIntel } from '@/ai/flows/discover-eco-intel-flow';
import { lightweightCountries } from '@/lib/location-data';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { searchWebAction } from '@/actions/search';
import { scrapeUrlAction } from '@/actions/scraper';


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
 * This function now uses the robust search-scrape-analyze pattern.
 */
export async function buildEcoIntelData(countryCodesToBuild: string[]): Promise<{ success: boolean; results: BuildResult[] }> {
    if (!countryCodesToBuild || countryCodesToBuild.length === 0) {
        return { success: false, results: [] };
    }
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;
    const collectionRef = db.collection('countryEcoIntel');
    const countriesToProcess = lightweightCountries.filter(c => countryCodesToBuild.includes(c.code));
    
    const buildPromises = countriesToProcess.map(async (country): Promise<BuildResult> => {
        const docRef = collectionRef.doc(country.code);
        try {
            console.log(`[Eco Intel Builder] Stage 1: Searching for ${country.name}...`);
            
            const existingDoc = await docRef.get();
            const existingData = existingDoc.exists ? existingDoc.data() as CountryEcoIntel : null;
            const curatedSitesQuery = (existingData?.curatedSearchSources || []).map(s => `site:${s.trim()}`).join(' OR ');

            const baseQuery = `"carbon offset projects" OR "environmental volunteer" OR "eco-tourism" in ${country.name}`;
            const searchQuery = curatedSitesQuery ? `(${baseQuery}) AND (${curatedSitesQuery})` : baseQuery;

            const searchResult = await searchWebAction({ query: searchQuery, apiKey, searchEngineId });

            if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
                // If curated search yields nothing, try a general search as a fallback
                const fallbackResult = await searchWebAction({ query: baseQuery, apiKey, searchEngineId });
                 if (!fallbackResult.success || !fallbackResult.results || fallbackResult.results.length === 0) {
                    throw new Error(`No web search results found for query: ${baseQuery}. Error: ${fallbackResult.error || 'N/A'}`);
                 }
                 searchResult.results = fallbackResult.results;
            }
            
            console.log(`[Eco Intel Builder] Stage 2: Scraping top results for ${country.name}...`);
            const scrapePromises = searchResult.results.slice(0, 3).map(result => scrapeUrlAction(result.link));
            const scrapeResults = await Promise.all(scrapePromises);
            
            let searchResultsText = "";
            scrapeResults.forEach((scrapeResult, index) => {
                if (scrapeResult.success && scrapeResult.content) {
                    searchResultsText += `Content from ${searchResult.results![index].link}:\n${scrapeResult.content}\n\n---\n\n`;
                }
            });

            if (!searchResultsText.trim()) {
                throw new Error('Could not scrape any meaningful content from top search results.');
            }

            console.log(`[Eco Intel Builder] Stage 3: Analyzing content for ${country.name}...`);
            const ecoData = await discoverEcoIntel({ countryName: country.name, searchResultsText });
            
            if (ecoData && ecoData.countryName) {
                // Preserve curated sources during the build
                const finalData = {
                    ...ecoData,
                    curatedSearchSources: existingData?.curatedSearchSources || [],
                    id: country.code,
                    lastBuildStatus: 'success',
                    lastBuildAt: FieldValue.serverTimestamp(),
                    lastBuildError: null
                };
                await docRef.set(finalData, { merge: true });
                return { status: 'success', countryCode: country.code, countryName: country.name };
            } else {
                 throw new Error(`AI failed to return sufficient data after analysis.`);
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
