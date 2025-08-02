
'use server';

import axios from 'axios';
import * as cheerio from 'cheerio';

interface ScrapeResult {
    title: string;
    paragraphs: string[];
}

/**
 * Scrapes a given URL for its title and the first three paragraphs.
 * This is a server-side action for testing purposes.
 * @param url The URL to scrape.
 * @returns An object indicating success or failure, with scraped data or an error message.
 */
export async function scrapeUrlForTest(url: string): Promise<{ success: boolean; data?: ScrapeResult; error?: string }> {
    if (!url) {
        return { success: false, error: 'URL is required.' };
    }

    try {
        // Fetch the HTML content of the page
        const { data: html } = await axios.get(url, {
            headers: {
                // Use a common user-agent to avoid being blocked
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Load the HTML into cheerio
        const $ = cheerio.load(html);

        // Extract the page title
        const title = $('title').text() || 'No title found';

        // Extract the text from the first 3 paragraph tags
        const paragraphs = $('p').slice(0, 3).map((i, elem) => $(elem).text()).get();

        return { 
            success: true, 
            data: { title, paragraphs } 
        };

    } catch (error: any) {
        console.error(`Error scraping URL: ${url}`, error);
        if (axios.isAxiosError(error)) {
            return { success: false, error: `Failed to fetch the URL. Status: ${error.response?.status}` };
        }
        return { success: false, error: `An unexpected error occurred: ${error.message}` };
    }
}
