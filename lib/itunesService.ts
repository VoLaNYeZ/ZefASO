import { supabase } from './supabase';

// Queue system to respect iTunes API rate limits (approx 20 req/min)
// We'll use a 3-second delay between requests to be safe.

// Helper function to call iTunes API through Supabase Edge Function proxy
async function fetchThroughProxy(itunesUrl: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('itunes-proxy', {
        body: { url: itunesUrl }
    });

    if (error) {
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
    private delayMs = 3000; // 3 seconds delay

    add(term: string, country: string, appId: string): Promise<number | null> {
        return new Promise((resolve, reject) => {
            this.queue.push({ term, country, appId, resolve, reject });
            this.process();
        });
    }

    private async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const item = this.queue.shift();

        if (item) {
            try {
                const rank = await this.fetchRankFromApi(item.term, item.country, item.appId);
                item.resolve(rank);
            } catch (error) {
                console.error(`Error fetching rank for ${item.term} in ${item.country}:`, error);
                item.resolve(null); // Resolve with null on error to keep queue moving
            }

            // Wait before processing next item
            setTimeout(() => {
                this.isProcessing = false;
                this.process();
            }, this.delayMs);
        } else {
            this.isProcessing = false;
        }
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

        console.log(`[iTunes] -----------------------------------------------------------`);
        console.log(`[iTunes] Fetching: ${url}`);
        console.log(`[iTunes] Raw App ID: '${rawAppId}' -> Target App ID: '${targetAppId}'`);

        const data = await fetchThroughProxy(url);

        console.log(`[iTunes] Search for "${term}" in ${country} returned ${data.resultCount} results.`);

        if (data.resultCount === 0) return null;

        // Debug: Log the first result to see structure
        if (data.results.length > 0) {
            const first = data.results[0];
            console.log(`[iTunes] First result: "${first.trackName}" (ID: ${first.trackId}, Bundle: ${first.bundleId})`);
        }

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
            const foundApp = data.results[index];
            console.log(`[iTunes] ✅ MATCH FOUND at rank ${index + 1}: "${foundApp.trackName}" (ID: ${foundApp.trackId})`);
            return index + 1; // Rank is 1-based
        }

        // Not found - log first 10 results to help debug
        console.log(`[iTunes] ❌ App not found in top 200. Looking for ID: '${trimmedTargetId}'`);
        console.log(`[iTunes] First 10 results for debugging:`);
        data.results.slice(0, 10).forEach((app: any, i: number) => {
            console.log(`  ${i + 1}. "${app.trackName}" - ID: ${app.trackId}, Bundle: ${app.bundleId || 'N/A'}`);
        });

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

    console.log(`[iTunes Top5] Fetching top 5 for "${term}" in ${country}`);

    const data = await fetchThroughProxy(url);

    if (data.resultCount === 0) return [];

    // Take first 5 results and map to Top5App interface
    const top5 = data.results.slice(0, 5).map((app: any, index: number) => ({
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

    console.log(`[iTunes Top5] Found ${top5.length} apps`);

    return top5;
};
