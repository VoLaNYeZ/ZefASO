import { supabase } from './supabase';
import { AsoEntry } from '../types';

// Get the current user ID
const getUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
};

// ============================================
// ASO Data
// ============================================

export const loadAsoData = async (): Promise<AsoEntry[]> => {
    const userId = await getUserId();
    const { data, error } = await supabase
        .from('aso_entries')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('Error loading ASO data:', error);
        return [];
    }

    // Transform database format to app format
    return (data || []).map(row => ({
        id: row.id.toString(),
        date: row.date,
        appName: row.app_name,
        appId: row.app_id,
        geo: row.geo,
        keyword: row.keyword,
        installs: row.installs,
        ranking: row.ranking,
        cpi: parseFloat(row.cpi)
    }));
};

export const saveAsoData = async (entries: AsoEntry[]): Promise<void> => {
    const userId = await getUserId();

    // Transform app format to database format
    const dbEntries = entries.map(entry => ({
        user_id: userId,
        date: entry.date,
        app_name: entry.appName,
        app_id: entry.appId,
        geo: entry.geo,
        keyword: entry.keyword,
        installs: entry.installs,
        ranking: entry.ranking,
        cpi: entry.cpi
    }));

    // Use UPSERT pattern - merge new data with existing
    // This prevents data loss if sync fails or partial data is sent
    const batchSize = 500;
    for (let i = 0; i < dbEntries.length; i += batchSize) {
        const batch = dbEntries.slice(i, i + batchSize);
        const { error } = await supabase
            .from('aso_entries')
            .upsert(batch, {
                onConflict: 'user_id,date,app_id,geo,keyword',
                ignoreDuplicates: false // Update existing entries
            });

        if (error) {
            console.error('Error saving ASO data batch:', error);
        }
    }
};

// Check if user has Google Sheets sync configured
export const checkGoogleSheetsSyncExists = async (): Promise<boolean> => {
    try {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('google_sheets_sync')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle();

        return !error && data !== null;
    } catch {
        return false;
    }
};

// Check if user has ever set up the app (has saved settings)
// This prevents INITIAL_DATA from reappearing after user deletes all data
export const checkIsExistingUser = async (): Promise<boolean> => {
    try {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('app_settings')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle();

        return !error && data !== null;
    } catch {
        return false;
    }
};

// Delete all ASO entries for a specific app (explicit deletion)
export const deleteAsoEntriesForApp = async (appId: string): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('aso_entries')
        .delete()
        .eq('user_id', userId)
        .eq('app_id', appId);

    if (error) {
        console.error('Error deleting app entries:', error);
    }
};

// Delete all ASO entries for a specific app by NAME (for "Delete All" action)
export const deleteAsoEntriesForAppName = async (appName: string): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('aso_entries')
        .delete()
        .eq('user_id', userId)
        .eq('app_name', appName);

    if (error) {
        console.error('Error deleting app entries by name:', error);
        throw error;
    }
};

// Delete all ASO entries for user (for explicit "delete all" action)
export const deleteAllAsoEntries = async (): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('aso_entries')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('Error deleting all entries:', error);
    }
};

// ============================================
// App Settings
// ============================================

interface AppSettings {
    appIcons: Record<string, string>;
    categories: string[];
    appCategoryMap: Record<string, string>;
    collapsedCategories: string[];
}

export const loadAppSettings = async (): Promise<AppSettings> => {
    const userId = await getUserId();
    const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false, nullsLast: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error loading app settings:', error);
        throw error;
    }

    if (!data) {
        // Return defaults if no settings exist (New User)
        return {
            appIcons: {},
            categories: ['General'],
            appCategoryMap: {},
            collapsedCategories: []
        };
    }

    return {
        appIcons: data.app_icons || {},
        categories: data.categories || ['General'],
        appCategoryMap: data.app_category_map || {},
        collapsedCategories: data.collapsed_categories || []
    };
};

export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('app_settings')
        .upsert({
            user_id: userId,
            app_icons: settings.appIcons,
            categories: settings.categories,
            app_category_map: settings.appCategoryMap,
            collapsed_categories: settings.collapsedCategories,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Error saving app settings:', error);
    }
};

// ============================================
// User Preferences
// ============================================

interface UserPreferences {
    lang: 'en' | 'ru';
    theme: 'light' | 'dark';
    hiddenApps: string[];
    apiUsage?: Record<string, any>;
}

export interface BalanceEntry {
    id: string;
    amount: number;
    note: string | null;
    entryDate: string;
    createdAt?: string;
}

export interface AppAlias {
    id?: string;
    appName: string;
    appId: string;
    prefix: string;
    number: string;
    isPrimary: boolean;
}

export interface AppAlias {
    id?: string;
    appName: string;
    appId: string;
    prefix: string;
    number: string;
    isPrimary: boolean;
}

export const loadUserPreferences = async (): Promise<UserPreferences> => {
    const userId = await getUserId();
    const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false, nullsLast: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error loading user preferences:', error);
        throw error;
    }

    if (!data) {
        return {
            lang: 'en',
            theme: 'light',
            hiddenApps: []
        };
    }

    return {
        lang: data.lang as 'en' | 'ru',
        theme: data.theme as 'light' | 'dark',
        hiddenApps: data.hidden_apps || [],
        apiUsage: data.api_usage || {}
    };
};

export const getApiUsage = async (service: string): Promise<number> => {
    const prefs = await loadUserPreferences();
    return prefs.apiUsage?.[service]?.count || 0;
};

export const incrementApiUsage = async (service: string): Promise<number> => {
    const userId = await getUserId();
    const prefs = await loadUserPreferences();

    const currentUsage = prefs.apiUsage?.[service] || { count: 0, month: new Date().toISOString().slice(0, 7) };

    // Check if month changed, reset if needed (optional, but good practice)
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (currentUsage.month !== currentMonth) {
        currentUsage.count = 0;
        currentUsage.month = currentMonth;
    }

    currentUsage.count += 1;

    const newApiUsage = {
        ...(prefs.apiUsage || {}),
        [service]: currentUsage
    };

    const { error } = await supabase
        .from('user_preferences')
        .update({
            api_usage: newApiUsage,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

    if (error) {
        console.error('Error incrementing API usage:', error);
        throw error;
    }

    return currentUsage.count;
};

export const saveUserPreferences = async (prefs: UserPreferences): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('user_preferences')
        .upsert({
            user_id: userId,
            lang: prefs.lang,
            theme: prefs.theme,
            hidden_apps: prefs.hiddenApps,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Error saving user preferences:', error);
    }
};

// ============================================
// Balance Tracker
// ============================================

export const loadBalanceEntries = async (): Promise<BalanceEntry[]> => {
    const userId = await getUserId();

    try {
        const { data, error } = await supabase
            .from('balance_entries')
            .select('*')
            .eq('user_id', userId)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading balance entries:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id?.toString?.() ?? row.id,
            amount: Number(row.amount) || 0,
            note: row.note ?? null,
            entryDate: row.entry_date || row.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            createdAt: row.created_at
        }));
    } catch (err) {
        console.error('Unexpected error loading balance entries:', err);
        return [];
    }
};

export const addBalanceEntry = async (entry: { amount: number; note?: string | null; entryDate: string }): Promise<BalanceEntry | null> => {
    const userId = await getUserId();

    const { data, error } = await supabase
        .from('balance_entries')
        .insert([{
            user_id: userId,
            amount: entry.amount,
            note: entry.note || null,
            entry_date: entry.entryDate,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error('Error adding balance entry:', error);
        return null;
    }

    return {
        id: data.id?.toString?.() ?? data.id,
        amount: Number(data.amount) || entry.amount,
        note: data.note ?? null,
        entryDate: data.entry_date || entry.entryDate,
        createdAt: data.created_at
    };
};

// ============================================
// App Aliases
// ============================================

export const loadAppAliases = async (): Promise<AppAlias[]> => {
    const userId = await getUserId();

    try {
        const { data, error } = await supabase
            .from('app_aliases')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error loading app aliases:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id?.toString?.() ?? row.id,
            appName: row.app_name,
            appId: row.app_id,
            prefix: row.prefix || '',
            number: row.number || '',
            isPrimary: !!row.is_primary
        }));
    } catch (err) {
        console.error('Unexpected error loading app aliases:', err);
        return [];
    }
};

export const saveAppAliasesForApp = async (appName: string, aliases: Omit<AppAlias, 'id' | 'appName'>[]): Promise<AppAlias[]> => {
    const userId = await getUserId();

    // Keep DB in sync: remove existing rows for this app/user, then insert current state
    const { error: deleteError } = await supabase
        .from('app_aliases')
        .delete()
        .eq('user_id', userId)
        .eq('app_name', appName);

    if (deleteError) {
        console.error('Error clearing aliases before save:', deleteError);
        throw deleteError;
    }

    if (aliases.length === 0) {
        return [];
    }

    const payload = aliases.map(alias => ({
        user_id: userId,
        app_name: appName,
        app_id: alias.appId,
        prefix: alias.prefix,
        number: alias.number,
        is_primary: alias.isPrimary,
        updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from('app_aliases')
        .insert(payload)
        .select();

    if (error) {
        console.error('Error saving app aliases:', error);
        throw error;
    }

    return (data || []).map((row: any) => ({
        id: row.id?.toString?.() ?? row.id,
        appName: row.app_name,
        appId: row.app_id,
        prefix: row.prefix || '',
        number: row.number || '',
        isPrimary: !!row.is_primary
    }));
};

// ============================================
// Real-Time Rankings
// ============================================

export interface RealtimeRanking {
    id?: string;
    appId: string;
    keyword: string;
    geo: string;
    rank: number | null;
    traffic?: number | null;
    trafficData?: any;
    lastUpdated: string;
}

export const loadRealtimeRankings = async (appId: string): Promise<RealtimeRanking[]> => {
    const userId = await getUserId();
    const { data, error } = await supabase
        .from('realtime_rankings')
        .select('*')
        .eq('user_id', userId)
        .eq('app_id', appId);

    if (error) {
        console.error('Error loading realtime rankings:', error);
        return [];
    }

    return (data || []).map(row => ({
        id: row.id,
        appId: row.app_id,
        keyword: row.keyword,
        geo: row.geo,
        rank: row.rank,
        traffic: row.traffic,
        trafficData: row.traffic_data,
        lastUpdated: row.last_updated
    }));
};

export const saveRealtimeRanking = async (ranking: RealtimeRanking): Promise<void> => {
    const userId = await getUserId();

    const { error } = await supabase
        .from('realtime_rankings')
        .upsert({
            user_id: userId,
            app_id: ranking.appId,
            keyword: ranking.keyword,
            geo: ranking.geo,
            rank: ranking.rank,
            traffic: ranking.traffic,
            traffic_data: ranking.trafficData,
            last_updated: new Date().toISOString()
        }, {
            onConflict: 'user_id,app_id,keyword,geo'
        });

    if (error) {
        console.error('Error saving realtime ranking:', error);
    }
};

// ============================================
// Country Rankings
// ============================================

export interface CountryRanking {
    code: string;
    label: number;
    name?: string;
    population?: number;
    gdp?: number;
}

export const fetchCountryRankings = async (): Promise<Record<string, CountryRanking>> => {
    try {
        const response = await supabase
            .from('countries_ranked')
            .select('*');

        const { data, error } = response;

        if (error) {
            console.error('Error loading country rankings:', error);
            return {};
        }

        if (!data || data.length === 0) {
            return {};
        }

        const map: Record<string, CountryRanking> = {};
        (data || []).forEach((row: any) => {
            // Try different casing variations
            const code = row.Code || row.code || row.CODE;
            const label = row.Label || row.label || row.LABEL;
            const name = row.GEO || row.Geo || row.geo;
            const population = row.population_2025 || row.Population_2025;
            const gdp = row.GDP_pc_2025 || row.gdp_pc_2025;

            if (code && label) {
                map[code.toUpperCase()] = {
                    code: code.toUpperCase(),
                    label,
                    name,
                    population,
                    gdp
                };
            }
        });

        return map;
    } catch (err) {
        console.error('Unexpected error in fetchCountryRankings:', err);
        return {};
    }
};
