

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
            console.log(`[Eco Intel Builder] Stage 1: Compiling queries for ${country.name}...`);
            
            const queries = [
                // Phase 1: Foundational Info - Government & Top NGOs
                `official website ministry of environment ${country.name}`,
                `official website department of wildlife protection ${country.name}`,
                `top environmental NGOs in ${country.name}`,
                // Phase 2: Actionable Opportunities - Carbon Offsetting & Volunteering
                `"carbon offsetting projects" in ${country.name}`,
                `"environmental volunteer" opportunities in ${country.name}`,
                `"work exchange" conservation ${country.name}`, // Added "work exchange"
                // Phase 3: Broader Context - National Policies & Tourism
                `"climate change initiatives" in ${country.name}`,
                `"${country.name} sustainable development goals"`,
                `"eco-tourism" OR "sustainable travel" in ${country.name}` // Broadened search
            ];

            let allScrapedContent = "";
            let scrapedUrlCount = 0;

            console.log(`[Eco Intel Builder] Stage 2: Executing ${queries.length} searches for ${country.name}...`);

            for (const query of queries) {
                console.log(`[Eco Intel Builder]   - Searching: "${query}"`);
                const searchResult = await searchWebAction({ query, apiKey, searchEngineId });
                if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                    console.log(`[Eco Intel Builder]   - Found ${searchResult.results.length} result(s). Scraping top result.`);
                    const topUrl = searchResult.results[0].link;
                    if (topUrl) {
                        const scrapeResult = await scrapeUrlAction(topUrl);
                        if (scrapeResult.success && scrapeResult.content) {
                            allScrapedContent += `Content from ${topUrl} (for query "${query}"):\n${scrapeResult.content}\n\n---\n\n`;
                            scrapedUrlCount++;
                            console.log(`[Eco Intel Builder]   - SUCCESS scraping ${topUrl}. Content length: ${scrapeResult.content.length}.`);
                        } else {
                            console.warn(`[Eco Intel Builder]   - FAILED to scrape ${topUrl}. Reason: ${scrapeResult.error}`);
                        }
                    }
                } else {
                     console.warn(`[Eco Intel Builder]   - No search results for query: "${query}"`);
                }
            }

            if (!allScrapedContent.trim()) {
                throw new Error('Could not scrape any meaningful content from top search results for any query.');
            }
            
            console.log(`[Eco Intel Builder] Stage 3: Analyzing content from ${scrapedUrlCount} sources for ${country.name}...`);
            const ecoData = await discoverEcoIntel({ countryName: country.name, searchResultsText: allScrapedContent });
            
            if (ecoData && ecoData.countryName) {
                const finalData = {
                    ...ecoData,
                    id: country.code,
                    lastBuildStatus: 'success',
                    lastBuildAt: FieldValue.serverTimestamp(),
                    lastBuildError: null
                };
                await docRef.set(finalData, { merge: true });
                 console.log(`[Eco Intel Builder] SUCCESS for ${country.name}. Data saved.`);
                return { status: 'success', countryCode: country.code, countryName: country.name };
            } else {
                if (ecoData && !ecoData.countryName) {
                     throw new Error(`AI returned a valid but empty object, indicating no data could be extracted.`);
                }
                 throw new Error(`AI failed to return sufficient data after analysis.`);
            }
        } catch (error: any) {
            console.error(`[Eco Intel Builder] CRITICAL ERROR processing ${country.name}:`, error);
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
