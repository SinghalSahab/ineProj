/**
 * db/supabase.ts
 * Supabase client instance using service role key server-side.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
} else {
  console.warn(
    '[DB WARNING] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Operating in mock/dry-run mode for database operations.'
  );
}

export function getDb(): SupabaseClient | null {
  return supabase;
}
