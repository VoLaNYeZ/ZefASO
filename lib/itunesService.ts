import { supabase } from './supabase';
import { withRetry } from '../utils/retry';

// Queue system to respect iTunes API rate limits (approx 20 req/min)
// We'll use a 3-second delay between requests to be safe.

// Helper function to call iTunes API through Supabase Edge Function proxy
async function fetchThroughProxy(itunesUrl: string, retryCount = 0): Promise<any> {
    const { data, error } = await withRetry(() => supabase.functions.invoke('itunes-proxy', {
        body: { url: itunesUrl }
    }));

    if (error) {
        // Check if it's a rate limit error
        if (error.message?.includes('429') || error.message?.includes('Rate limited')) {
            if (retryCount < 3) {
                // Wait 60 seconds and retry
                console.warn(`[iTunes] Rate limited, waiting 60s before retry ${retryCount + 1}/3`);
                await new Promise(r => setTimeout(r, 60000));
                return fetchThroughProxy(itunesUrl, retryCount + 1);
            }
        }
        console.error('[iTunes Proxy] Error:', error);
        throw new Error(`Proxy error: ${error.message}`);
    }

    return data;
}

type QueueItem = {
    term: string;
    country: string;
    appId: string;
    resolve: (rank: number | null) => void;
    reject: (error: any) => void;
};

class RequestQueue {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private batchSize = 5;          // Fire 5 requests at once
    private batchDelayMs = 15000;   // Wait 15s between batches (5 req per 15s = 20/min)

    add(term: string, country: string, appId: string): Promise<number | null> {
        return new Promise((resolve, reject) => {
            this.queue.push({ term, country, appId, resolve, reject });
            this.process();
        });
    }

    private async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        while (this.queue.length > 0) {
            // Take up to batchSize items
            const batch = this.queue.splice(0, this.batchSize);

            // Fire all requests in parallel
            const promises = batch.map(async (item) => {
                try {
                    const rank = await this.fetchRankFromApi(item.term, item.country, item.appId);
                    item.resolve(rank);
                } catch (error) {
                    console.error(`Error fetching rank for ${item.term} in ${item.country}:`, error);
                    item.resolve(null);
                }
            });

            // Wait for all in batch to complete
            await Promise.all(promises);

            // If more items remain, wait before next batch to respect rate limit
            if (this.queue.length > 0) {
                await new Promise(r => setTimeout(r, this.batchDelayMs));
            }
        }

        this.isProcessing = false;
    }

    private async fetchRankFromApi(term: string, country: string, rawAppId: string): Promise<number | null> {
        // Map non-standard country codes to ISO 3166-1 alpha-2
        const countryMap: Record<string, string> = {
            'UK': 'GB',
            'SW': 'SE', // Common mistake: Sweden is SE, not SW
            'EN': 'US', // Default EN to US
        };

        const upperCountry = country.toUpperCase();
        const itunesCountry = countryMap[upperCountry] || upperCountry;

        // Sanitize App ID: It might be "AppName AppID" or just "AppID"
        // We take the last part after splitting by space to get the ID/BundleID
        const parts = rawAppId.trim().split(' ');
        const targetAppId = parts[parts.length - 1];

        // iTunes Search API
        // limit=200 to find the app in top 200. If not found, we assume unranked (or > 200).
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${itunesCountry}&entity=software&limit=200`;

        const data = await fetchThroughProxy(url);

        if (data.resultCount === 0) return null;

        // Find index of our app
        // Check both trackId (numeric) and bundleId (string)
        const trimmedTargetId = targetAppId.trim();

        const index = data.results.findIndex((app: any) => {
            const appTrackId = String(app.trackId || '').trim();
            const appBundleId = (app.bundleId || '').trim();

            const matchId = appTrackId === trimmedTargetId;
            const matchBundle = appBundleId === trimmedTargetId;

            return matchId || matchBundle;
        });

        if (index !== -1) {
            return index + 1; // Rank is 1-based
        }

        return null; // Not found in top 200
    }
}

export const itunesQueue = new RequestQueue();

export const fetchAppRank = (term: string, country: string, appId: string) => {
    return itunesQueue.add(term, country, appId);
};

// Top 5 Apps feature
export interface Top5App {
    rank: number;
    trackId: number;
    trackName: string;
    artworkUrl100: string;
    averageUserRating: number;
    userRatingCount: number;
    screenshotUrls: string[];
    description: string;
    sellerName: string;
    genres: string[];
    trackViewUrl: string;
}

export const fetchTop5Apps = async (term: string, country: string): Promise<Top5App[]> => {
    // Map non-standard country codes to ISO 3166-1 alpha-2
    const countryMap: Record<string, string> = {
        'UK': 'GB',
        'SW': 'SE', // Common mistake: Sweden is SE, not SW
        'EN': 'US', // Default EN to US
    };

    const upperCountry = country.toUpperCase();
    const itunesCountry = countryMap[upperCountry] || upperCountry;

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${itunesCountry}&entity=software&limit=200`;

    const data = await fetchThroughProxy(url);

    if (data.resultCount === 0) return [];

    // Take first 20 results and map to Top5App interface
    const top5 = data.results.slice(0, 20).map((app: any, index: number) => ({
        rank: index + 1,
        trackId: app.trackId,
        trackName: app.trackName || 'Unknown App',
        artworkUrl100: app.artworkUrl100 || app.artworkUrl512 || app.artworkUrl60 || '',
        averageUserRating: app.averageUserRating || 0,
        userRatingCount: app.userRatingCount || 0,
        screenshotUrls: app.screenshotUrls || [],
        description: app.description || app.trackCensoredName || '',
        sellerName: app.sellerName || app.artistName || 'Unknown',
        genres: app.genres || [],
        trackViewUrl: app.trackViewUrl || `https://apps.apple.com/app/id${app.trackId}`
    }));

    return top5;
};
