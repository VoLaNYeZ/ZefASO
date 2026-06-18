/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_USDT_WALLET_ADDRESS?: string
    readonly VITE_USDT_WALLET_QR_PATH?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
