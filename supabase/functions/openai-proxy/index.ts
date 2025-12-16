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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const extractResponseText = (data: any): string => {
    if (typeof data?.output_text === 'string') return data.output_text;

    const output = data?.output;
    if (Array.isArray(output)) {
        const parts: string[] = [];
        for (const item of output) {
            const content = item?.content;
            if (!Array.isArray(content)) continue;

            for (const part of content) {
                if (typeof part?.text === 'string') parts.push(part.text);
            }
        }
        if (parts.length > 0) return parts.join('');
    }

    if (typeof data?.choices?.[0]?.message?.content === 'string') {
        return data.choices[0].message.content;
    }

    return '';
};

const normalizeKeywordsJson = (raw: string): string | null => {
    const trimmed = raw.trim();

    const unfenced = (() => {
        const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        return match?.[1]?.trim() ?? trimmed;
    })();

    const tryParse = (text: string) => {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    };

    const parsed =
        tryParse(unfenced) ??
        (() => {
            const first = unfenced.indexOf('{');
            const last = unfenced.lastIndexOf('}');
            if (first === -1 || last === -1 || last <= first) return null;
            return tryParse(unfenced.slice(first, last + 1));
        })();

    const keywords = parsed?.keywords;
    if (!Array.isArray(keywords)) return null;

    const cleaned = keywords
        .map((k: unknown) => String(k ?? '').trim())
        .filter(Boolean);

    return JSON.stringify({ keywords: cleaned });
};

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
        let model = 'gpt-5-mini';
        let maxTokens = 900;

        if (body.type === 'analysis') {
            const languageInstruction = body.language === 'ru'
                ? 'Ответь на русском языке.'
                : 'Respond in English.';

            messages = [
                {
                    role: 'system',
                    content: 'You are an expert ASO (App Store Optimization) Manager. Be concise, practical, and avoid incorrect causal claims.'
                },
                {
                    role: 'user',
                    content: `
You are an ASO operator optimizing Rank via controlled Installs (phone farm). Your goal is Rank efficiency.
Analyze the following performance data for App: "${body.appName}", GEO: "${body.geo}", Keyword: "${body.keyword}".

Data:
${body.dataSummary}

Important assumptions:
- Never say that improving Rank causes more Installs. Treat Installs as the main input signal that can influence Rank.
- Rank = 0 means no ranking data for that day or no ranking data at all.
- CPI is an internal value we set. Do not analyze CPI trends as a market signal. Use it only to estimate spend and efficiency.
- If you mention relationships, phrase them as "Installs and Rank moved together" or "Installs changes preceded Rank changes".

Output requirements:
- Keep it short - no long paragraphs.
- Use exactly 3 sections with headings (use ###):
  ### Insights
  ### Efficiency
  ### Next actions
- Each section: 2-4 bullets max, use "-" bullets only.

 Please provide a concise analysis covering:
  1. How Rank responds to Installs over time (look for lag, speed and amount of installs needed to improve Rank, diminishing returns, and days where spend did not improve Rank).
  2. Efficiency of spend: highlight where Installs and estimated spend likely produced Rank improvement vs wasted spend.
  3. Actionable recommendations to improve Rank efficiency (e.g., change install volume, pause or reduce spend on stuck keywords, test alternatives).
  4. Use the full period shown in the header. Mention period start and end. If the period is short, state it.
 
 Keep the tone professional and executive-summary style.
 ${languageInstruction}
                     `.trim()
                 }
            ];
        } else if (body.type === 'keywords') {
            model = 'gpt-5-mini';
            maxTokens = 1000;

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

        const systemMessage = messages.find((m) => m.role === 'system')?.content;
        const inputMessages = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                ...(systemMessage ? { instructions: systemMessage } : {}),
                input: inputMessages,
                temperature: body.type === 'keywords' ? 0.2 : 0.7,
                max_output_tokens: maxTokens,
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
        let content = extractResponseText(data);

        if (body.type === 'keywords') {
            const normalized = normalizeKeywordsJson(content);
            if (!normalized) {
                return new Response(
                    JSON.stringify({ error: 'Model returned invalid JSON for keywords' }),
                    { status: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
                );
            }
            content = normalized;
        }

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
