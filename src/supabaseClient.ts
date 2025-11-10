import { createClient, SupabaseClient } from '@supabase/supabase-js';

// As variáveis são injetadas pelo script no index.html no objeto window
const supabaseUrl = (window as any).process?.env?.SUPABASE_URL;
const supabaseAnonKey = (window as any).process?.env?.SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    } catch (error) {
        console.error("Erro de inicialização do Supabase:", error instanceof Error ? error.message : "Erro desconhecido.");
    }
} else {
    console.warn("Credenciais do Supabase não encontradas. A aplicação usará o Local Storage como fallback.");
}

export default supabase;
