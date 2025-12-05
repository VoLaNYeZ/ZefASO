// Supabase Edge Function to proxy iTunes API requests
// This hides user IPs from Apple by routing requests through Supabase servers

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Issue 1.2 FIX: Restricted CORS to specific origins instead of wildcard
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
        const { url } = await req.json();

        // Issue 1.4 FIX: Strict URL validation using URL parser instead of .includes()
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return new Response(
                JSON.stringify({ error: 'Invalid URL format' }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        if (parsedUrl.hostname !== 'itunes.apple.com') {
            return new Response(
                JSON.stringify({ error: 'Only itunes.apple.com URLs are allowed' }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[iTunes Proxy] Fetching: ${url}`);

        // Make the request to iTunes API from Supabase servers
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ASO-Tool/1.0)',
            },
        });

        // Handle rate limiting with Retry-After
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '60';
            return new Response(
                JSON.stringify({ error: 'Rate limited by iTunes API', retryAfter: parseInt(retryAfter) }),
                {
                    status: 429,
                    headers: {
                        ...corsHeaders(origin),
                        'Content-Type': 'application/json',
                        'Retry-After': retryAfter
                    }
                }
            );
        }

        if (!response.ok) {
            return new Response(
                JSON.stringify({ error: `iTunes API error: ${response.status} ${response.statusText}` }),
                { status: response.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();

        console.log(`[iTunes Proxy] Success: ${data.resultCount || 0} results`);

        return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const origin = req.headers.get('origin');
        console.error('[iTunes Proxy] Error:', error);

        return new Response(
            JSON.stringify({ error: error.message || 'Failed to fetch from iTunes API' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
});
