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

    // Delete all existing entries for this user
    await supabase
        .from('aso_entries')
        .delete()
        .eq('user_id', userId);

    // Insert new entries in batches (Supabase has limits)
    const batchSize = 500;
    for (let i = 0; i < dbEntries.length; i += batchSize) {
        const batch = dbEntries.slice(i, i + batchSize);
        const { error } = await supabase
            .from('aso_entries')
            .insert(batch);

        if (error) {
            console.error('Error saving ASO data batch:', error);
        }
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
        .single();

    if (error || !data) {
        // Return defaults if no settings exist
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
}

export const loadUserPreferences = async (): Promise<UserPreferences> => {
    const userId = await getUserId();
    const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        return {
            lang: 'en',
            theme: 'light',
            hiddenApps: []
        };
    }

    return {
        lang: data.lang as 'en' | 'ru',
        theme: data.theme as 'light' | 'dark',
        hiddenApps: data.hidden_apps || []
    };
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
// Real-Time Rankings
// ============================================

export interface RealtimeRanking {
    id?: string;
    appId: string;
    keyword: string;
    geo: string;
    rank: number | null;
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
            last_updated: new Date().toISOString()
        }, {
            onConflict: 'user_id,app_id,keyword,geo'
        });

    if (error) {
        console.error('Error saving realtime ranking:', error);
    }
};
