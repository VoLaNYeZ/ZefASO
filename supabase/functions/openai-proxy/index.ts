// Supabase Edge Function to proxy OpenAI API requests
// This keeps the API key secure on the server side

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

interface OpenAIRequest {
    type: 'analysis' | 'keywords';
    // For analysis
    dataSummary?: string;
    appName?: string;
    geo?: string;
    keyword?: string;
    language?: 'en' | 'ru';
    // For keywords
    existingKeywords?: string[];
}

serve(async (req) => {
    const origin = req.headers.get('origin');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(origin) });
    }

    try {
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key not configured' }),
                { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        const body: OpenAIRequest = await req.json();

        let messages: { role: string; content: string }[] = [];
        let model = 'gpt-4o-mini';
        let maxTokens = 2000;
        let responseFormat: { type: string } | undefined;

        if (body.type === 'analysis') {
            const languageInstruction = body.language === 'ru'
                ? 'Ответь на русском языке.'
                : 'Respond in English.';

            messages = [
                {
                    role: 'system',
                    content: 'You are an expert ASO (App Store Optimization) Manager providing professional analysis and recommendations.'
                },
                {
                    role: 'user',
                    content: `
You are an expert ASO (App Store Optimization) Manager.
Analyze the following performance data for App: "${body.appName}", GEO: "${body.geo}", Keyword: "${body.keyword}".

Data:
${body.dataSummary}

Please provide a concise analysis covering:
1. The correlation between Ranking and Installs.
2. Cost efficiency trends.
3. Actionable recommendations to improve ROI and Ranking (e.g., increase bid, change keyword).

Keep the tone professional and executive-summary style.
${languageInstruction}
                    `.trim()
                }
            ];
        } else if (body.type === 'keywords') {
            model = 'gpt-4o-mini';
            maxTokens = 1000;
            responseFormat = { type: 'json_object' };

            messages = [
                {
                    role: 'system',
                    content: 'You are an expert ASO Manager. Output ONLY valid JSON.'
                },
                {
                    role: 'user',
                    content: `
You are an expert in App Store Optimization (ASO) for Apple's App Store.

Task:
Based on the app info I give you, suggest NEW search keywords for ASO. These keywords should:
- Clearly match what the app does and who it's for
- Have likely search traffic (avoid ultra-niche 0-traffic phrases)
- Not repeat any of the existing keywords I provide
- Best for optimising, the ones actual people will be searching for

App:
- Name: ${body.appName}
- GEO / storefront: ${body.geo}

Current keyword set (already used): ${body.existingKeywords?.join(', ') || 'none'}

Based on this:
1. Infer what the app does, core use cases, and target audience.
2. Propose 25-40 NEW keywords (not in the current set) that could bring traffic.
   Mix:
   - Core/category terms
   - Feature / problem keywords
   - Audience / intent keywords
   - Some longer-tail phrases

Return ONLY valid JSON in the following format:
{
    "keywords": ["keyword1", "keyword2", ...]
}

No extra text, no explanations outside the JSON.
Suggest keywords in English.
                    `.trim()
                }
            ];
        } else {
            return new Response(
                JSON.stringify({ error: 'Invalid request type. Use "analysis" or "keywords".' }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[OpenAI Proxy] Processing ${body.type} request for app: ${body.appName}`);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: maxTokens,
                ...(responseFormat && { response_format: responseFormat }),
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[OpenAI Proxy] API Error:', errorData);
            return new Response(
                JSON.stringify({ error: errorData.error?.message || 'OpenAI API error' }),
                { status: response.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';

        console.log(`[OpenAI Proxy] Success for ${body.type}`);

        // Return the content directly
        return new Response(
            JSON.stringify({ content }),
            { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[OpenAI Proxy] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
});
