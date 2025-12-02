import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingVars = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY'
].filter(Boolean) as string[];

export const supabaseConfigError = missingVars.length
    ? `Missing Supabase environment variable${missingVars.length > 1 ? 's' : ''}: ${missingVars.join(', ')}`
    : null;

export const supabaseEnvStatus = {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey)
};

if (supabaseConfigError) {
    console.error(supabaseConfigError);
}

export const isSupabaseConfigured = !supabaseConfigError;

// Provide a harmless fallback client in development/preview so the UI can render
// with a clear error message instead of crashing when env vars are missing.
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'public-anon-key';

export const supabase: SupabaseClient = createClient(
    supabaseUrl || fallbackUrl,
    supabaseAnonKey || fallbackKey
);
