// Supabase Edge Function to proxy iTunes API requests
// This hides user IPs from Apple by routing requests through Supabase servers

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { url } = await req.json();

        if (!url || !url.includes('itunes.apple.com')) {
            return new Response(
                JSON.stringify({ error: 'Invalid iTunes URL' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        console.log(`[iTunes Proxy] Fetching: ${url}`);

        // Make the request to iTunes API from Supabase servers
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ASO-Tool/1.0)',
            },
        });

        if (!response.ok) {
            // Return the upstream error directly so client knows what happened
            return new Response(
                JSON.stringify({ error: `iTunes API error: ${response.status} ${response.statusText}` }),
                {
                    status: response.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        const data = await response.json();

        console.log(`[iTunes Proxy] Success: ${data.resultCount || 0} results`);

        return new Response(
            JSON.stringify(data),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        console.error('[iTunes Proxy] Error:', error);

        return new Response(
            JSON.stringify({
                error: error.message || 'Failed to fetch from iTunes API'
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
