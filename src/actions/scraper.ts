
'use server';

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetches the content of a URL and extracts the text from its body and attempts to find a publication date.
 * This is a server-side action to handle the external request securely.
 * @param {string} url - The URL of the webpage to scrape.
 * @returns {Promise<{success: boolean, content?: string, publishedDate?: string, error?: string}>} An object with the scraped content or an error message.
 */
export async function scrapeUrlAction(url: string): Promise<{success: boolean, content?: string, publishedDate?: string, error?: string}> {
  if (!url) {
    return { success: false, error: 'No URL provided.' };
  }

  try {
    const { data, status } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000 // 10 second timeout
    });

    if (status !== 200) {
      return { success: false, error: `Failed to fetch the URL. Status: ${status}` };
    }

    const $ = cheerio.load(data);

    // Remove script and style tags to clean up the text
    $('script, style').remove();
    
    // Attempt to find a publication date
    let publishedDate: string | undefined;
    const timeTag = $('time').first();
    if (timeTag.length > 0 && timeTag.attr('datetime')) {
        publishedDate = timeTag.attr('datetime');
    } else {
        // Fallback to common meta tags
        const metaDate = $('meta[property="article:published_time"], meta[name="pubdate"], meta[name="date"]').first();
        if (metaDate.length > 0 && metaDate.attr('content')) {
            publishedDate = metaDate.attr('content');
        }
    }

    // Extract text from the body
    const content = $('body').text().replace(/\s+/g, ' ').trim();

    if (!content) {
        return { success: false, error: 'Could not extract meaningful content from the page.' };
    }

    return { success: true, content: content.substring(0, 5000), publishedDate }; // Limit content size

  } catch (error: any) {
    console.error(`[Scraper] Error fetching URL ${url}:`, error.message);
    if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
            return { success: false, error: 'Failed to fetch the URL. Status: 404 Not Found' };
        }
        return { success: false, error: `Could not fetch URL. Reason: ${error.message}` };
    }
    return { success: false, error: `An unexpected error occurred during scraping: ${error.message}` };
  }
}
