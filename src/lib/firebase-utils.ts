
'use server';

import { db } from '@/lib/firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';


/**
 * Finds a user by their email address using the Admin SDK.
 * This is a shared utility for server actions.
 * @returns The user object or null if not found.
 */
export async function findUserByEmailAdmin(email: string): Promise<{id: string; data: any} | null> {
    if (!email) return null;
    const usersRef = db.collection('users');
    const q = usersRef.where('email', '==', email.toLowerCase()).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
        return null;
    }
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, data: userDoc.data() };
}


// --- Helper Functions for Web Scraping ---

async function searchWeb(query: string): Promise<string[]> {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    // This check is now more explicit about what's missing.
    if (!apiKey || !searchEngineId) {
        throw new Error("Google Search API credentials are not configured on the server. Please set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your .env.local file and restart the development server.");
    }
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await axios.get(url);
        const items = response.data.items || [];
        return items.slice(0, 4).map((item: any) => item.link); // Return top 4 URLs
    } catch (error: any) {
        console.error("[Intel Search] Error performing Google search:", error.response?.data || error.message);
        throw new Error("Failed to execute web search.");
    }
}

async function scrapeUrl(url: string): Promise<string> {
    try {
        const { data } = await axios.get(url, { timeout: 4000 });
        const $ = cheerio.load(data);
        $('script, style, nav, footer, header, aside').remove();
        const mainContent = $('body').text().replace(/\s+/g, ' ').trim();
        return mainContent.substring(0, 4000); // Limit content per page
    } catch (error: any) {
        console.warn(`[Intel Scrape] Failed to scrape ${url}:`, error.message);
        return `Scraping failed for ${url}.`; // Return error message instead of empty string
    }
}


/**
 * A dedicated server-side utility to perform web research for a given country.
 * This function is guaranteed to run in a pure server context, giving it access
 * to all environment variables.
 * @param countryName The name of the country to research.
 * @returns A string containing the combined text from all scraped web pages.
 */
export async function getTravelIntelFromGoogle(countryName: string): Promise<string> {
     const searchQueries = [
      `travel advisory ${countryName}`,
      `latest travel news ${countryName} tourists`,
      `common tourist scams ${countryName}`,
    ];
    const searchPromises = searchQueries.map(searchWeb);
    const searchResults = await Promise.all(searchPromises);
    const uniqueUrls = [...new Set(searchResults.flat())];

    const scrapePromises = uniqueUrls.map(scrapeUrl);
    const scrapedContents = await Promise.all(scrapePromises);
    
    return scrapedContents.join('\n\n---\n\n');
}

