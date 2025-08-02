
'use server';

import axios from 'axios';
import * as cheerio from 'cheerio';
import { getAppSettingsAction } from './settings';

interface ScrapeResult {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * Scrapes a list of URLs for travel advisories related to a specific country.
 * @param countryName - The name of the country to search for within the content.
 * @returns {Promise<ScrapeResult>} An object containing the scraped text and a success flag.
 */
export async function scrapeSourcesForCountry(countryName: string): Promise<ScrapeResult> {
    console.log(`[Scraper] Starting scrape for: ${countryName}`);
    try {
        const settings = await getAppSettingsAction();
        const urlsString = settings.infohubSources;

        if (!urlsString) {
            console.warn('[Scraper] No InfoHub source URLs are configured in settings.');
            return { success: false, error: 'No sources configured.' };
        }

        const urls = urlsString.split(',').map(url => url.trim()).filter(Boolean);
        if (urls.length === 0) {
            console.warn('[Scraper] Source URL string is empty after trim/filter.');
            return { success: false, error: 'No valid sources configured.' };
        }
        
        let allText = '';

        for (const url of urls) {
            try {
                console.log(`[Scraper] Fetching URL: ${url}`);
                const { data } = await axios.get(url, {
                    timeout: 5000, // 5-second timeout for the request
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    }
                });
                
                const $ = cheerio.load(data);
                
                // Simple text extraction. This is a naive implementation and might need
                // to be more sophisticated depending on the target sites' structure.
                // It looks for text within common content tags.
                $('p, h1, h2, h3, article, .post-content, .entry-content').each((i, elem) => {
                    const text = $(elem).text();
                    // A simple filter to only include paragraphs that mention the country
                    if (text.toLowerCase().includes(countryName.toLowerCase())) {
                        allText += text + '\n\n';
                    }
                });

            } catch (fetchError: any) {
                console.error(`[Scraper] Failed to fetch or parse URL ${url}:`, fetchError.message);
                // Continue to the next URL even if one fails
            }
        }
        
        // Self-check: Ensure meaningful content was scraped. Lowered threshold.
        if (allText.trim().length < 50) { 
            console.warn(`[Scraper] Scrape for ${countryName} resulted in very little content (${allText.trim().length} chars). Treating as failure.`);
            return { success: false, error: 'Could not find recent, relevant advisories from the configured sources.' };
        }
        
        console.log(`[Scraper] Scrape successful for ${countryName}. Total characters scraped: ${allText.length}`);
        return { success: true, content: allText.slice(0, 15000) }; // Limit content size to avoid huge AI prompts

    } catch (error: any) {
        console.error(`[Scraper] Critical error during scraping process for ${countryName}:`, error);
        return { success: false, error: 'An unexpected server error occurred during the scraping process.' };
    }
}
