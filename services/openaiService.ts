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
    const safeEntries = Array.isArray(entries) ? [...entries] : [];
    safeEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dates = safeEntries.map(e => e.date).filter(Boolean);
    const periodStart = dates[0] || 'Unknown';
    const periodEnd = dates.length > 0 ? dates[dates.length - 1] : 'Unknown';
    const uniqueDays = new Set(dates).size;

    const installsTotal = safeEntries.reduce((sum, e) => sum + (Number.isFinite(e.installs) ? e.installs : 0), 0);
    const spendTotal = safeEntries.reduce((sum, e) => {
        const installs = Number.isFinite(e.installs) ? e.installs : 0;
        const cpi = Number.isFinite(e.cpi) ? e.cpi : 0;
        return sum + installs * cpi;
    }, 0);

    const validRanks = safeEntries.map(e => e.ranking).filter(r => Number.isFinite(r) && r > 0) as number[];
    const bestRank = validRanks.length > 0 ? Math.min(...validRanks) : null;
    const worstRank = validRanks.length > 0 ? Math.max(...validRanks) : null;

    const startValid = safeEntries.find(e => Number.isFinite(e.ranking) && e.ranking > 0) || null;
    const endValid = [...safeEntries].reverse().find(e => Number.isFinite(e.ranking) && e.ranking > 0) || null;

    const header =
        language === 'ru'
            ? [
                `Период: ${periodStart} - ${periodEnd}`,
                `Строк: ${safeEntries.length}, дней: ${uniqueDays}`,
                `Инсталлы: ${installsTotal}, траты (оценка): $${spendTotal.toFixed(2)}`,
                `Ранг (валидный): ${bestRank !== null ? `лучший ${bestRank}` : 'нет данных'}${worstRank !== null ? `, худший ${worstRank}` : ''}`,
                `${startValid ? `Старт: ${startValid.date} rank ${startValid.ranking}` : 'Старт: нет валидного ранга'}`,
                `${endValid ? `Финиш: ${endValid.date} rank ${endValid.ranking}` : 'Финиш: нет валидного ранга'}`
            ].join('\n')
            : [
                `Period: ${periodStart} - ${periodEnd}`,
                `Rows: ${safeEntries.length}, days: ${uniqueDays}`,
                `Installs: ${installsTotal}, est spend: $${spendTotal.toFixed(2)}`,
                `Rank (valid): ${bestRank !== null ? `best ${bestRank}` : 'no data'}${worstRank !== null ? `, worst ${worstRank}` : ''}`,
                `${startValid ? `Start: ${startValid.date} rank ${startValid.ranking}` : 'Start: no valid rank'}`,
                `${endValid ? `End: ${endValid.date} rank ${endValid.ranking}` : 'End: no valid rank'}`
            ].join('\n');

    const rowsForPrompt = (() => {
        const maxRows = 140;
        if (safeEntries.length <= maxRows) return safeEntries;
        const head = safeEntries.slice(0, 40);
        const tail = safeEntries.slice(-100);
        return [...head, ...tail];
    })();

    const dataSummary = [
        header,
        '',
        ...(safeEntries.length > rowsForPrompt.length
            ? [language === 'ru'
                ? `Показаны первые ${Math.min(40, safeEntries.length)} строк и последние ${Math.min(100, safeEntries.length)} строк (для экономии токенов).`
                : `Showing first ${Math.min(40, safeEntries.length)} and last ${Math.min(100, safeEntries.length)} rows (to reduce tokens).`,
            '']
            : []),
        ...rowsForPrompt.map(e => {
            const rank = Number.isFinite(e.ranking) ? e.ranking : 0;
            const installs = Number.isFinite(e.installs) ? e.installs : 0;
            const cpi = Number.isFinite(e.cpi) ? e.cpi : 0;
            return `Date: ${e.date}, Rank: ${rank}, Installs: ${installs}, CPI: $${cpi}`;
        })
    ].join('\n');

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
