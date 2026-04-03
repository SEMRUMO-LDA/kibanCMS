import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in .env');
}

// Default client with anon key - respects RLS policies
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service role key - bypasses RLS
// Only use for admin operations (user invite, user delete, etc.)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;
