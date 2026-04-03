import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL in .env');
}

if (!supabaseServiceKey && !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials. Configure SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env');
}

// Server-side client uses service role key to bypass RLS.
// Authorization is enforced at the application layer (middleware + ownership checks).
// This is the standard Supabase pattern for server-side APIs.
export const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey!);

// Admin client for Supabase Auth admin operations (invite, delete user).
// Falls back to the same client if service key is available.
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;
