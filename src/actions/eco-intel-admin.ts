

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

export interface BuildResult {
    countryCode: string;
    countryName: string;
    status: 'success' | 'failed';
    error?: string;
    log: string[];
}

/**
 * Builds or updates the eco-intel database for a given country code.
 * This function now uses a more robust, parallelized research strategy to avoid timeouts.
 */
export async function buildEcoIntelData(countryCode: string): Promise<BuildResult> {
    const country = lightweightCountries.find(c => c.code === countryCode);
    if (!country) {
        return { status: 'failed', countryCode, countryName: 'Unknown', error: 'Country code not found', log: ['[FAIL] Country code not found in lightweightCountries list.'] };
    }
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;
    const collectionRef = db.collection('countryEcoIntel');
    const docRef = collectionRef.doc(country.code);
    const log: string[] = [];

    try {
        log.push(`[INFO] Stage 1: Compiling queries for ${country.name}...`);
        
        const queries = [
            `official website ministry of environment ${country.name}`,
            `top environmental NGOs in ${country.name}`,
            `reputable wildlife conservation organizations in ${country.name}`,
            `"carbon offsetting projects" in ${country.name}`,
            `"climate change initiatives" in ${country.name}`,
            `"${country.name} sustainable development goals"`,
            `"eco-tourism" OR "sustainable travel" in ${country.name}`,
            `"environmental volunteer" opportunities in ${country.name}`,
            `"work exchange" conservation ${country.name}`
        ];

        log.push(`[INFO] Stage 2: Executing ${queries.length} searches for ${country.name} in parallel...`);

        // --- Parallel Search ---
        const searchPromises = queries.map(query => 
            searchWebAction({ query, apiKey, searchEngineId })
        );
        const searchResults = await Promise.all(searchPromises);
        // --- End Parallel Search ---

        let allScrapedContent = "";
        let scrapedUrlCount = 0;

        const scrapeItems: { url: string; query: string }[] = [];
        searchResults.forEach((searchResult, index) => {
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                const topUrl = searchResult.results[0].link;
                if (topUrl) {
                    scrapeItems.push({ url: topUrl, query: queries[index] });
                }
            } else {
                 log.push(`[WARN]   - No search results for query: "${queries[index]}"`);
            }
        });
        
        log.push(`[INFO] Stage 3: Scraping top ${scrapeItems.length} URLs in parallel...`);
        
        // --- Parallel Scrape ---
        const scrapePromises = scrapeItems.map(({url}) => scrapeUrlAction(url));
        const scrapeResults = await Promise.all(scrapePromises);
        // --- End Parallel Scrape ---
        
        scrapeResults.forEach((scrapeResult, index) => {
            const { url, query } = scrapeItems[index];
             if (scrapeResult.success && scrapeResult.content) {
                allScrapedContent += `Content from ${url} (for query "${query}"):\n${scrapeResult.content}\n\n---\n\n`;
                scrapedUrlCount++;
                log.push(`[SUCCESS]   - Scraped ${url}. Content length: ${scrapeResult.content.length}.`);
            } else {
                log.push(`[WARN]   - FAILED to scrape ${url}. Reason: ${scrapeResult.error}.`);
                // Fallback to snippet if scrape fails is handled implicitly as AI might use it
            }
        });
        

        if (!allScrapedContent.trim()) {
            throw new Error('Could not scrape any meaningful content from top search results for any query.');
        }
        
        log.push(`[INFO] Stage 4: Analyzing content from ${scrapedUrlCount} sources for ${country.name}...`);
        const ecoData = await discoverEcoIntel({ countryName: country.name, searchResultsText: allScrapedContent });
        
        if (ecoData && ecoData.countryName) {
            const finalData = {
                ...ecoData,
                id: country.code,
                lastBuildStatus: 'success' as const,
                lastBuildAt: FieldValue.serverTimestamp(),
                lastBuildError: null
            };
            await docRef.set(finalData, { merge: true });
            log.push(`[SUCCESS] SUCCESS for ${country.name}. Data saved.`);
            return { status: 'success', countryCode: country.code, countryName: country.name, log };
        } else {
            if (ecoData && !ecoData.countryName) {
                 throw new Error(`AI returned a valid but empty object, indicating no data could be extracted.`);
            }
             throw new Error(`AI failed to return sufficient data after analysis.`);
        }
    } catch (error: any) {
        log.push(`[CRITICAL] CRITICAL ERROR processing ${country.name}:`, error.message);
        await docRef.set({
            countryName: country.name,
            id: country.code,
            lastBuildStatus: 'failed' as const,
            lastBuildError: error.message || 'An unknown error occurred during AI discovery.',
            lastBuildAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { status: 'failed', countryCode: country.code, countryName: country.name, error: error.message, log };
    }
}
