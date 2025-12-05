import { RealtimeRanking } from '../lib/supabaseService';

const API_BASE_URL = '/asomobile-api';

export interface TrafficData {
    traffic: {
        value: number;
    };
    ci: {
        value: number;
    };
    kei: {
        value: number;
    };
    suggestions: string[];
    top_apps: {
        type: string;
        app_id: string;
    }[];
    [key: string]: any;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchTrafficData = async (keyword: string, geo: string): Promise<TrafficData> => {
    const apiKey = import.meta.env.VITE_ASO_MOBILE_API_KEY;

    if (!apiKey) {
        throw new Error('ASOMobile API Key is missing. Please add VITE_ASO_MOBILE_API_KEY to your .env.local file.');
    }

    // Map non-standard country codes to ISO 3166-1 alpha-2
    const countryMap: Record<string, string> = {
        'UK': 'GB',
        'SW': 'SE',
        'EN': 'US',
    };
    const upperGeo = geo.toUpperCase();
    const mappedGeo = countryMap[upperGeo] || upperGeo;

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    // 1. Create Ticket
    // Note: The API requires platform and ios_device. Assuming IOS/IPHONE for now as this seems to be an iOS ASO tool.
    const checkUrl = `${API_BASE_URL}/keyword-check/?platform=IOS&ios_device=IPHONE&country=${mappedGeo}&keyword=${encodeURIComponent(keyword)}`;

    const checkResponse = await fetch(checkUrl, { method: 'GET', headers });

    if (!checkResponse.ok) {
        const errorText = await checkResponse.text();
        throw new Error(`Failed to create traffic check ticket: ${checkResponse.status} ${errorText}`);
    }

    const checkData = await checkResponse.json();

    // Accept both 200 and 201 status codes
    if ((checkData.code !== 200 && checkData.code !== 201) || !checkData.data?.ticket_id) {
        throw new Error(`Invalid response from traffic check: ${JSON.stringify(checkData)}`);
    }

    const ticketId = checkData.data.ticket_id;

    // 2. Poll for Result
    const maxRetries = 10;
    const pollInterval = 2000; // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
        await wait(pollInterval);

        const resultUrl = `${API_BASE_URL}/keyword-check/result?ticket_id=${ticketId}`;
        const resultResponse = await fetch(resultUrl, { method: 'GET', headers });

        if (!resultResponse.ok) {
            console.warn(`Polling attempt ${i + 1} failed: ${resultResponse.status}`);
            continue;
        }

        const resultData = await resultResponse.json();

        // Check if data is present
        if (resultData.code === 200 && resultData.data && resultData.data.traffic) {
            return resultData.data as TrafficData;
        }

        // If code is not 200 or data is missing, it might be processing.
    }

    throw new Error('Timeout waiting for traffic data');
};
