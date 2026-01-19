import { supabase } from '../lib/supabase';
import { toIsoCountryCode } from '../utils/geo';

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
    const mappedGeo = toIsoCountryCode(geo);

    // 1. Create Ticket via Edge Function
    // Note: The API requires platform and ios_device. Assuming IOS/IPHONE for now as this seems to be an iOS ASO tool.
    const { data: checkData, error: checkError } = await supabase.functions.invoke('asomobile-proxy', {
        body: {
            endpoint: '/keyword-check/',
            method: 'GET',
            params: {
                platform: 'IOS',
                ios_device: 'IPHONE',
                country: mappedGeo,
                keyword: keyword
            }
        }
    });

    if (checkError) {
        throw new Error(`Failed to create traffic check ticket: ${checkError.message}`);
    }

    // Accept both 200 and 201 status codes
    if ((checkData.code !== 200 && checkData.code !== 201) || !checkData.data?.ticket_id) {
        throw new Error(`Invalid response from traffic check: ${JSON.stringify(checkData)}`);
    }

    const ticketId = checkData.data.ticket_id;

    // 2. Poll for Result via Edge Function
    const maxRetries = 10;
    const pollInterval = 2000; // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
        await wait(pollInterval);

        const { data: resultData, error: resultError } = await supabase.functions.invoke('asomobile-proxy', {
            body: {
                endpoint: '/keyword-check/result',
                method: 'GET',
                params: {
                    ticket_id: ticketId
                }
            }
        });

        if (resultError) {
            console.warn(`Polling attempt ${i + 1} failed: ${resultError.message}`);
            continue;
        }

        // Check if data is present
        if (resultData.code === 200 && resultData.data && resultData.data.traffic) {
            return resultData.data as TrafficData;
        }

        // If code is not 200 or data is missing, it might be processing.
    }

    throw new Error('Timeout waiting for traffic data');
};
