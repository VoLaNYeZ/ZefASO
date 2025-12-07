import { AsoEntry } from '../types';
import { DEFAULT_CPI } from '../constants';

// Issue 1.3 FIX: Validate that URL is a legitimate Google Apps Script URL
const validateGoogleScriptUrl = (url: string): void => {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'script.google.com' ||
            !parsed.pathname.startsWith('/macros/s/')) {
            throw new Error('Invalid Google Apps Script URL');
        }
    } catch (e) {
        throw new Error('Invalid URL. Must be a Google Apps Script URL (https://script.google.com/macros/s/...)');
    }
};

export const fetchSheetTabs = async (webAppUrl: string): Promise<string[]> => {
    validateGoogleScriptUrl(webAppUrl);
    const url = `${webAppUrl}?action=getTabs`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Failed to fetch tabs from Google Sheet");
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || "Failed to fetch tabs");
    }

    return data.tabs;
};

export const fetchSheetData = async (webAppUrl: string, tabName: string): Promise<any[][]> => {
    validateGoogleScriptUrl(webAppUrl);
    const url = `${webAppUrl}?action=getData&tab=${encodeURIComponent(tabName)}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Failed to fetch data from Google Sheet");
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || "Failed to fetch data");
    }

    return data.data || [];
};

// Helper to parse date from various formats
const parseDate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();

    // Handle DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
        const [day, month, year] = cleanStr.split('/');
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const d = new Date(isoDate);
        if (!isNaN(d.getTime())) return isoDate;
    }

    // Handle YYYY/MM/DD
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanStr)) {
        const [year, month, day] = cleanStr.split('/');
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const d = new Date(isoDate);
        if (!isNaN(d.getTime())) return isoDate;
    }

    // Handle YYYY-MM-DD
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime()) && cleanStr.includes('-')) {
        return cleanStr;
    }

    return null;
};

// Normalize country names to ISO codes
const normalizeGeoCode = (geo: string): string => {
    const trimmed = geo.trim();
    const upper = trimmed.toUpperCase();

    // Explicit map for common names and 3-letter codes
    const countryMap: Record<string, string> = {
        // Full names / variants
        'UNITED STATES': 'US', 'USA': 'US',
        'UNITED KINGDOM': 'GB', 'UK': 'GB',
        'GERMANY': 'DE', 'FRANCE': 'FR', 'ITALY': 'IT', 'SPAIN': 'ES',
        'CANADA': 'CA', 'AUSTRALIA': 'AU', 'AUSTRIA': 'AT', 'JAPAN': 'JP', 'CHINA': 'CN',
        'BRAZIL': 'BR', 'INDIA': 'IN', 'RUSSIA': 'RU', 'SOUTH KOREA': 'KR', 'POLAND': 'PL', 'PO': 'PL',
        // 3-letter codes that sometimes appear
        'AUS': 'AU', 'AUT': 'AT', 'POL': 'PL'
    };

    if (countryMap[upper]) return countryMap[upper];

    // If already 2-letter, just upper-case it
    if (upper.length === 2) return upper;

    // Fallback: first two letters uppercased
    return upper.substring(0, 2);
};

export const processSheetData = (rows: any[][], tabName: string): AsoEntry[] => {
    const newEntries: AsoEntry[] = [];

    // Skip header if present
    let startIndex = 0;
    if (rows.length > 0) {
        const firstRow = rows[0].map(c => String(c).toLowerCase());
        if (firstRow.some(c => c.includes('date') || c.includes('app'))) {
            startIndex = 1;
        }
    }

    // Validate data format by checking first few data rows
    const VALIDATION_SAMPLE_SIZE = Math.min(5, rows.length - startIndex);
    if (VALIDATION_SAMPLE_SIZE > 0) {
        let validRows = 0;
        let hasInvalidId = false;
        let hasInvalidKeyword = false;

        for (let i = startIndex; i < startIndex + VALIDATION_SAMPLE_SIZE; i++) {
            const row = rows[i];
            if (row.length < 8) continue;

            const idColumn = String(row[3]).trim();
            const keywordColumn = String(row[4]).trim();

            // Check if ID column (index 3) contains only numbers
            const isValidId = /^\d+$/.test(idColumn) && idColumn.length > 0;

            // Allow alphanumeric keywords (e.g., "1game"), just ensure non-empty and not "no data/date"
            const isValidKeyword = keywordColumn.length > 0 &&
                !keywordColumn.toLowerCase().includes('no data') &&
                !keywordColumn.toLowerCase().includes('no date');

            if (!isValidId) hasInvalidId = true;
            if (!isValidKeyword) hasInvalidKeyword = true;

            if (isValidId && isValidKeyword) {
                validRows++;
            }
        }

        // If no rows pass validation, throw descriptive error
        if (validRows === 0 && VALIDATION_SAMPLE_SIZE > 0) {
            let errorMsg = `❌ Data format validation failed for tab "${tabName}".\n\n`;
            errorMsg += `Expected format: Date | App Name | GEO | ID | Keyword | Last Plan | Ranking | Installs | [CPI]\n\n`;

            if (hasInvalidId && hasInvalidKeyword) {
                errorMsg += `Problem: Both ID and Keyword columns appear incorrect.\n`;
                errorMsg += `• Column 4 (ID) should contain only numbers\n`;
                errorMsg += `• Column 5 (Keyword) should contain text (not "no data")\n\n`;
                errorMsg += `💡 Tip: Check if your columns are aligned correctly in the Google Sheet.`;
            } else if (hasInvalidId) {
                errorMsg += `Problem: Column 4 (ID) should contain only numbers.\n`;
                errorMsg += `Found: Non-numeric values instead.\n\n`;
                errorMsg += `💡 Tip: Make sure the App ID column is in the correct position.`;
            } else if (hasInvalidKeyword) {
                errorMsg += `Problem: Column 5 (Keyword) appears empty or contains "no data".\n\n`;
                errorMsg += `💡 Tip: Verify that keyword data is in the correct column.`;
            }

            throw new Error(errorMsg);
        }
    }

    // Process data
    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        // Expected format: Date | App Name | GEO | ID | Keyword | Last Plan | Ranking | Installs | [CPI]
        // Tab name becomes the App Name

        if (row.length < 8) continue;

        const dateRaw = String(row[0]);
        const appGroup = tabName;
        const appName = String(row[1] ?? tabName).trim();
        const geo = normalizeGeoCode(String(row[2]));
        const csvIdRaw = String(row[3]).trim();
        const keyword = String(row[4]).trim();
        const rankingRaw = String(row[6]).trim();
        const installsRaw = String(row[7]).trim();
        const cpiRaw = row[8] ? String(row[8]) : undefined;

        const date = parseDate(dateRaw);

        let ranking = 0;
        if (!rankingRaw.toLowerCase().includes('no') && rankingRaw !== '') {
            const parsed = parseInt(rankingRaw);
            if (!isNaN(parsed)) ranking = parsed;
        }

        const installs = parseInt(installsRaw);

        if (date && !isNaN(installs)) {
            const normalizedId = (() => {
                if (/^\d+$/.test(csvIdRaw)) return csvIdRaw;
                const cleaned = csvIdRaw.replace(/[^\dA-Za-z_-]/g, '');
                return cleaned || appName;
            })();

            const entry: AsoEntry = {
                id: `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                date: date,
                appName: appName,
                appGroup: appGroup,
                geo: geo,
                appId: normalizedId,
                keyword: keyword,
                ranking: ranking,
                installs: installs,
                cpi: cpiRaw ? parseFloat(cpiRaw) : DEFAULT_CPI
            };
            newEntries.push(entry);
        }
    }

    return newEntries;
};
