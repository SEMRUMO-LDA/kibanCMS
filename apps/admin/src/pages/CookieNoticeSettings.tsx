import { getSupabase } from '../lib/supabase';
import { CookieSettingsPage } from '@addons/addons/cookie-notice/CookieSettingsPage';

export const CookieNoticeSettings = () => {
  const supabase = getSupabase();
  if (!supabase) return <p>Loading...</p>;
  return <CookieSettingsPage supabase={supabase} />;
};
