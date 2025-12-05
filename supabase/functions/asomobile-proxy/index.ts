// Supabase Edge Function to proxy ASOMobile API requests
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
    'https://zefaso.tech',
    'https://www.zefaso.tech',
    'http://localhost:3000',
    'http://localhost:5173'
];

const corsHeaders = (origin: string | null) => ({
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin || '') ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
});

serve(async (req) => {
    const origin = req.headers.get('origin');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(origin) });
    }

    try {
        const { endpoint, params, method = 'GET' } = await req.json();

        // Safe list of allowed endpoints
        const ALLOWED_ENDPOINTS = [
            '/keyword-check/',
            '/keyword-check/result'
        ];

        if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
            return new Response(
                JSON.stringify({ error: 'Endpoint not allowed' }),
                { status: 403, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Get API Key from Environment Secrets (Secure)
        const apiKey = Deno.env.get('ASO_MOBILE_API_KEY');
        if (!apiKey) {
            console.error('Missing ASO_MOBILE_API_KEY secret');
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Construct target URL
        // Base URL: https://app.asomobile.net/asomobile-public-api
        const baseUrl = 'https://app.asomobile.net/asomobile-public-api';

        // Build query string from params object
        const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
        const targetUrl = `${baseUrl}${endpoint}${queryString}`;

        console.log(`[ASOMobile Proxy] Proxying to: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        // Parse response
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            // Fallback if not JSON (e.g. error page)
            data = { error: 'Invalid upstream response', raw: text };
        }

        return new Response(
            JSON.stringify(data),
            {
                status: response.status,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        console.error('[ASOMobile Proxy] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Internal Server Error' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
});
