
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


/**
 * Saves the final, analyzed eco-intel data to Firestore.
 * This is the final step in the client-orchestrated build process.
 */
export async function saveEcoIntelData(countryCode: string, ecoData: any): Promise<{success: boolean, error?: string}> {
    const country = lightweightCountries.find(c => c.code === countryCode);
    if (!country) {
        return { success: false, error: 'Country not found.' };
    }
    
    const docRef = db.collection('countryEcoIntel').doc(country.code);
    
    try {
        const finalData = {
            ...ecoData,
            id: country.code,
            countryName: country.name, // Ensure countryName is always correct
            lastBuildStatus: 'success' as const,
            lastBuildAt: FieldValue.serverTimestamp(),
            lastBuildError: null
        };
        await docRef.set(finalData, { merge: true });
        return { success: true };
    } catch (error: any) {
        await docRef.set({
            countryName: country.name,
            id: country.code,
            lastBuildStatus: 'failed' as const,
            lastBuildError: error.message || 'An unknown error occurred during saving.',
            lastBuildAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: false, error: error.message };
    }
}

/**
 * Server-side action to build eco-intel data for a single country.
 * This function orchestrates the entire research process: search, scrape, analyze, and save.
 */
export async function buildEcoIntelData(countryCode: string): Promise<{ success: boolean; log: string[], error?: string }> {
    const log: string[] = [];
    const country = lightweightCountries.find(c => c.code === countryCode);
    if (!country) {
        return { success: false, log, error: `Country with code ${countryCode} not found.` };
    }

    try {
        log.push(`[INFO] Stage 1: Compiling queries for ${country.name}...`);
        
        // **NEW** Stage 1: Targeted government search
        const governmentQuery = `(ministry OR department OR agency) of (environment OR forestry OR conservation) official site ${country.name}`;
        log.push(`[INFO] Stage 1a: Executing targeted government search...`);
        const govSearchResult = await searchWebAction({ query: governmentQuery });

        let governmentScrapedContent = "";
        if (govSearchResult.success && govSearchResult.results && govSearchResult.results.length > 0) {
            const topResults = govSearchResult.results.slice(0, 2); // Scrape top 2 results
            log.push(`[INFO] Stage 1b: Scraping top ${topResults.length} government URLs...`);
            
            const scrapePromises = topResults.map(result => scrapeUrlAction(result.link));
            const scrapeResults = await Promise.allSettled(scrapePromises);

            scrapeResults.forEach((scrapeResult, index) => {
                const url = topResults[index].link;
                if (scrapeResult.status === 'fulfilled' && scrapeResult.value.success && scrapeResult.value.content) {
                    governmentScrapedContent += `Content from official source ${url}:\n${scrapeResult.value.content}\n\n---\n\n`;
                    log.push(`[SUCCESS] Scraped ${url}.`);
                } else {
                    const errorMsg = scrapeResult.status === 'fulfilled' ? scrapeResult.value.error : 'Promise rejected';
                    log.push(`[WARN] FAILED to scrape ${url}. Reason: ${errorMsg}.`);
                }
            });
        } else {
            log.push(`[WARN] No official government environment sites found for ${country.name}.`);
        }


        // **NEW** Stage 2: Broader search, but only using snippets (no scraping)
        log.push(`[INFO] Stage 2: Executing broader searches for snippets...`);
        const broaderQueries = [
            `"top environmental NGOs in ${country.name}"`,
            `"reputable wildlife conservation organizations in ${country.name}"`,
            `carbon offsetting projects in ${country.name}`,
            `"eco-tourism in ${country.name}"`,
            `"environmental volunteer opportunities in ${country.name}"`,
            `work exchange conservation ${country.name}`
        ];
        
        let broaderSearchResultsText = "";
        const searchPromises = broaderQueries.map(query => searchWebAction({ query }));
        const searchActionResults = await Promise.all(searchPromises);

        searchActionResults.forEach((searchResult, index) => {
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                 searchResult.results.forEach(item => {
                    broaderSearchResultsText += `Snippet for query "${broaderQueries[index]}" from ${item.link}:\n${item.snippet}\n\n---\n\n`;
                 });
            }
        });
        
        const combinedResearchText = governmentScrapedContent + broaderSearchResultsText;

        if (!combinedResearchText.trim()) {
            throw new Error('Could not gather any meaningful content from web search or scraping.');
        }

        log.push(`[INFO] Stage 3: Analyzing content...`);
        const ecoData = await discoverEcoIntel({ 
            countryName: country.name, 
            scrapedGovernmentContent: governmentScrapedContent,
            broaderSearchSnippets: broaderSearchResultsText
        });

        if (!ecoData || !ecoData.countryName) {
            throw new Error('AI failed to return sufficient data after analysis.');
        }
        
        log.push(`[INFO] Stage 4: Saving analyzed data to Firestore...`);
        const saveResult = await saveEcoIntelData(countryCode, ecoData);
        if (!saveResult.success) {
            throw new Error(saveResult.error || 'Failed to save data to Firestore.');
        }

        log.push(`[SUCCESS] Build for ${country.name} completed successfully.`);
        return { success: true, log };

    } catch (error: any) {
        log.push(`[CRITICAL] CRITICAL ERROR processing ${country.name}: ${error.message}`);
        return { success: false, log, error: error.message };
    }
}
