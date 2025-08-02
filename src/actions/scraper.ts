
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
export async function scrapeSources(urlsToScrape: string[]): Promise<string> {
    console.log(`[Scraper] Starting scrape for ${urlsToScrape.length} URLs.`);
    
    let allText = '';

    for (const url of urlsToScrape) {
        try {
            console.log(`[Scraper] Fetching URL: ${url}`);
            const { data } = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                }
            });
            
            const $ = cheerio.load(data);
            
            // Remove non-content elements to clean up the output
            $('script, style, nav, footer, header, aside').remove();
            
            // Prioritize main content areas, but fall back to the body
            let mainContent = $('main, article, .main-content, .post-content, #content, #main').first().text();
            if (!mainContent) {
                mainContent = $('body').text();
            }
            
            allText += mainContent.replace(/\s+/g, ' ').trim() + '\n\n';

        } catch (fetchError: any) {
            console.error(`[Scraper] Failed to fetch or parse URL ${url}:`, fetchError.message);
            // Continue to the next URL even if one fails
        }
    }
    
    console.log(`[Scraper] Scrape successful. Total characters scraped: ${allText.length}`);
    return allText.slice(0, 20000); // Limit content size to avoid huge AI prompts
}
