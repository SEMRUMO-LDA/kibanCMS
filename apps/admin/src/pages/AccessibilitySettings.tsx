import { getSupabase } from '../lib/supabase';
import { AccessibilitySettingsPage } from '../components/addons/AccessibilitySettingsPage';

export const AccessibilitySettings = () => {
  const supabase = getSupabase();
  if (!supabase) return <p>Loading...</p>;
  return <AccessibilitySettingsPage supabase={supabase} />;
};
