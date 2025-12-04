import { AsoEntry } from "../types";

// Initialize OpenAI API
const apiKey = process.env.API_KEY || ''; // Will be loaded from OPENAI_API_KEY env variable

export const analyzeASOTrends = async (
    entries: AsoEntry[],
    appName: string,
    geo: string,
    keyword: string,
    language: 'en' | 'ru' = 'en'
): Promise<string> => {
    if (!apiKey) {
        return "API Key is missing. Please configure your environment variables.";
    }

    // Summarize data to reduce token count
    const dataSummary = entries.map(e =>
        `Date: ${e.date}, Rank: ${e.ranking}, Installs: ${e.installs}, CPI: $${e.cpi}`
    ).join('\n');

    const languageInstruction = language === 'ru'
        ? 'Ответь на русском языке.'
        : 'Respond in English.';

    const prompt = `
    You are an expert ASO (App Store Optimization) Manager.
    Analyze the following performance data for App: "${appName}", GEO: "${geo}", Keyword: "${keyword}".
    
    Data:
    ${dataSummary}

    Please provide a concise analysis covering:
    1. The correlation between Ranking and Installs.
    2. Cost efficiency trends.
    3. Actionable recommendations to improve ROI and Ranking (e.g., increase bid, change keyword).
    
    Keep the tone professional and executive-summary style.
    ${languageInstruction}
  `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-5-mini-2025-08-07', // Using latest efficient model
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert ASO (App Store Optimization) Manager providing professional analysis and recommendations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            console.error("OpenAI API Error:", errorData);
            return `Failed to generate analysis. Error: ${errorData.error?.message || response.statusText}`;
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "No analysis could be generated.";
    } catch (error) {
        console.error("ChatGPT Analysis Error:", error);
        return "Failed to generate analysis. Please try again later.";
    }
};

export const generateKeywordSuggestions = async (
    appName: string,
    geo: string,
    existingKeywords: string[]
): Promise<string[]> => {
    if (!apiKey) {
        console.error("API Key is missing");
        return [];
    }

    const prompt = `
    You are an expert in App Store Optimization (ASO) for Apple's App Store.

    Task:
    Based on the app info and performance data I give you, suggest NEW search keywords
    for ASO. These keywords should:
    - Clearly match what the app does and who it's for
    - Have likely search traffic (avoid ultra-niche 0-traffic phrases)
    - Not repeat any of the existing keywords I provide
    - Best for optimising, the ones actual people will be searching for

    App:
    - Name: ${appName}
    - GEO / storefront: ${geo}

    Current keyword set (already used): ${existingKeywords.join(', ')}

    Based on this:
    1. Infer what the app does, core use cases, and target audience.
    2. Propose 25–40 NEW keywords (not in the current set) that could bring traffic.
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
    `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-5-nano-2025-08-07',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert ASO Manager. Output ONLY valid JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("OpenAI API Error:", errorData);
            return [];
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        try {
            const parsed = JSON.parse(content);
            if (parsed.keywords && Array.isArray(parsed.keywords)) {
                return parsed.keywords;
            }
            return [];
        } catch (e) {
            console.error("Failed to parse JSON:", e);
            return [];
        }
    } catch (error) {
        console.error("Keyword Suggester Error:", error);
        return [];
    }
};
