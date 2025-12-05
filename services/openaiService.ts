import { AsoEntry } from "../types";
import { supabase } from "../lib/supabase";
import { withRetry } from "../utils/retry";

export const analyzeASOTrends = async (
    entries: AsoEntry[],
    appName: string,
    geo: string,
    keyword: string,
    language: 'en' | 'ru' = 'en'
): Promise<string> => {
    // Summarize data to reduce token count
    const dataSummary = entries.map(e =>
        `Date: ${e.date}, Rank: ${e.ranking}, Installs: ${e.installs}, CPI: $${e.cpi}`
    ).join('\n');

    try {
        const { data, error } = await withRetry(() => supabase.functions.invoke('openai-proxy', {
            body: {
                type: 'analysis',
                dataSummary,
                appName,
                geo,
                keyword,
                language
            }
        }));

        if (error) {
            console.error("OpenAI Proxy Error:", error);
            return `Failed to generate analysis. Error: ${error.message}`;
        }

        return data?.content || "No analysis could be generated.";
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
    try {
        const { data, error } = await withRetry(() => supabase.functions.invoke('openai-proxy', {
            body: {
                type: 'keywords',
                appName,
                geo,
                existingKeywords
            }
        }));

        if (error) {
            console.error("OpenAI Proxy Error:", error);
            return [];
        }

        const content = data?.content;
        if (!content) return [];

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
