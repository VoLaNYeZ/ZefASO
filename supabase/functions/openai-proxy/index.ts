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

const extractTextFromUnknownContent = (content: unknown): string => {
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const part of content) {
            const text = (part as any)?.text;
            const refusal = (part as any)?.refusal;
            if (typeof text === 'string') parts.push(text);
            else if (typeof text?.value === 'string') parts.push(text.value);
            else if (typeof refusal === 'string') parts.push(refusal);
            else if (typeof refusal?.value === 'string') parts.push(refusal.value);
        }
        return parts.join('');
    }

    const text = (content as any)?.text;
    const refusal = (content as any)?.refusal;
    if (typeof text === 'string') return text;
    if (typeof text?.value === 'string') return text.value;
    if (typeof refusal === 'string') return refusal;
    if (typeof refusal?.value === 'string') return refusal.value;

    return '';
};

const extractResponseText = (data: any): string => {
    // Responses API (new)
    if (typeof data?.output_text === 'string') return data.output_text;

    const output = data?.output;
    if (Array.isArray(output)) {
        const parts: string[] = [];
        for (const item of output) {
            const directText = extractTextFromUnknownContent(item?.text);
            if (directText) {
                parts.push(directText);
                continue;
            }

            const extracted = extractTextFromUnknownContent(item?.content);
            if (extracted) parts.push(extracted);
        }
        if (parts.length > 0) return parts.join('');
    }

    // Chat Completions API (legacy)
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const messageContent = extractTextFromUnknownContent(message?.content);
    if (messageContent) return messageContent;

    if (typeof message?.refusal === 'string') return message.refusal;

    const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
    if (typeof toolArgs === 'string') return toolArgs;

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
        // NOTE: GPT-5 models can spend a lot of completion tokens on internal reasoning.
        // If max is too low, you can get finish_reason="length" with empty `message.content`.
        let maxTokens = 2000;

        if (body.type === 'analysis') {
            const languageInstruction = body.language === 'ru'
                ? 'Ответь на русском языке.'
                : 'Respond in English.';

            messages = [
                {
                    role: 'system',
                    content: 'You are an expert ASO (App Store Optimization) Manager. Be concise, practical, and avoid incorrect causal claims. Respond with the final answer only.'
                },
                {
                    role: 'user',
                    content: `
You are an ASO operator analyzing rank and install performance. Your goal is Rank efficiency.
Analyze the following performance data for App: "${body.appName}", GEO: "${body.geo}", Keyword: "${body.keyword}".

Data:
${body.dataSummary}

Important assumptions:
- Never say that improving Rank causes more Installs. Treat Installs as the main input signal that can influence Rank.
- Rank = 0 means no ranking data for that day or no ranking data at all.
- CPI is a configured planning value. Do not analyze CPI trends as a market signal. Use it only to estimate spend and efficiency.
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
            model = 'gpt-5-nano';
            // NOTE: Even nano can spend tokens on internal reasoning; keep enough budget for JSON output.
            maxTokens = 1200;

            messages = [
                {
                    role: 'system',
                    content: 'You are an expert ASO Manager. Output ONLY valid JSON and nothing else (no code fences, no extra text). Respond with the final answer only.'
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

        const callOpenAI = async (maxCompletionTokens: number) => {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_completion_tokens: maxCompletionTokens,
                }),
            });

            const raw = await response.text();
            return { response, raw };
        };

        let maxCompletionTokens = maxTokens;
        let { response, raw } = await callOpenAI(maxCompletionTokens);

        if (!response.ok) {
            let errorMessage = 'OpenAI API error';
            try {
                const parsed = JSON.parse(raw);
                errorMessage = parsed?.error?.message || errorMessage;
            } catch {
                if (raw.trim()) errorMessage = raw.slice(0, 300);
            }

            console.error('[OpenAI Proxy] API Error:', errorMessage);
            return new Response(
                JSON.stringify({ error: errorMessage }),
                { status: response.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        const parseUpstreamJson = (text: string) => {
            try {
                return JSON.parse(text);
            } catch {
                return null;
            }
        };

        let data: any = parseUpstreamJson(raw);
        if (!data) {
            console.error('[OpenAI Proxy] Failed to parse upstream JSON');
            return new Response(
                JSON.stringify({ error: 'Invalid JSON from OpenAI' }),
                { status: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        let content = extractResponseText(data).trim();
        const finishReason = data?.choices?.[0]?.finish_reason;

        // Retry once if the model hit the token limit and produced no final text.
        if (!content && finishReason === 'length') {
            const retryFloor = body.type === 'keywords' ? 2000 : 4000;
            const retryCap = body.type === 'keywords' ? 4000 : 8000;
            const retryMax = Math.min(Math.max(maxCompletionTokens * 2, retryFloor), retryCap);
            if (retryMax > maxCompletionTokens) {
                maxCompletionTokens = retryMax;
                ({ response, raw } = await callOpenAI(maxCompletionTokens));

                if (!response.ok) {
                    let errorMessage = 'OpenAI API error';
                    try {
                        const parsed = JSON.parse(raw);
                        errorMessage = parsed?.error?.message || errorMessage;
                    } catch {
                        if (raw.trim()) errorMessage = raw.slice(0, 300);
                    }

                    console.error('[OpenAI Proxy] API Retry Error:', errorMessage);
                    return new Response(
                        JSON.stringify({ error: errorMessage }),
                        { status: response.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
                    );
                }

                data = parseUpstreamJson(raw);
                if (!data) {
                    console.error('[OpenAI Proxy] Failed to parse upstream JSON (retry)');
                    return new Response(
                        JSON.stringify({ error: 'Invalid JSON from OpenAI' }),
                        { status: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
                    );
                }

                content = extractResponseText(data).trim();
            }
        }

        if (!content) {
            console.error('[OpenAI Proxy] Empty content from upstream. Keys:', Object.keys(data || {}), 'finish_reason:', finishReason);
            // Don’t silently return empty content; it hides upstream shape mismatches.
            return new Response(
                JSON.stringify({
                    error: 'Empty content from OpenAI (unexpected response shape)',
                }),
                { status: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

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
