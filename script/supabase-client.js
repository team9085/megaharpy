/*
 * Mega Harpy #9085 — Supabase client
 * A publishable key is intended to be used in browser code.
 * Never put a secret/service_role key in this file.
 */

const SUPABASE_URL = "https://uhikbdkmbxyvuqygoxur.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_q3_y_Auefa9OZx7B0VI_zg_k3qLlTRU";

if (!window.supabase?.createClient) {
    throw new Error(
        "Supabase JS não foi carregado. Verifique a conexão com o CDN em supabase-client.js."
    );
}

window.megaHarpySupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);
