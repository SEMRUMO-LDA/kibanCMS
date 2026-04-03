/**
 * Site Settings Page
 * Global website configuration — stored as a single entry in 'site-settings' collection.
 * Accessible via API: GET /api/v1/entries/site-settings/global
 */

import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import {
  Globe, Save, Loader, Image as ImageIcon, Palette, Share2,
  Mail, MapPin, Phone, Clock, BarChart3, Code, FileText, CheckCircle,
} from 'lucide-react';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`max-width: 900px; animation: ${fadeIn} 0.4s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};
  display: flex; align-items: center; justify-content: space-between;
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const SaveBtn = styled.button<{ $saving?: boolean }>`
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]};
  color: #fff;
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  transition: background 0.15s;
  &:hover:not(:disabled) { background: ${colors.accent[600]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  svg { width: 18px; height: 18px; }
`;

const Section = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  margin-bottom: ${spacing[5]};
  overflow: hidden;
`;

const SectionHeader = styled.div`
  padding: ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[100]};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  h2 { margin: 0; font-size: ${typography.fontSize.base}; font-weight: 600; color: ${colors.gray[900]}; }
  .icon { width: 36px; height: 36px; border-radius: ${borders.radius.md}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; svg { width: 18px; height: 18px; } }
`;

const SectionBody = styled.div`padding: ${spacing[5]};`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${spacing[4]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Field = styled.div<{ $full?: boolean }>`
  ${p => p.$full && 'grid-column: 1 / -1;'}

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: 500;
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};
  }

  input, textarea, select {
    width: 100%;
    padding: ${spacing[3]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    transition: border-color 0.15s;
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
  }

  textarea { min-height: 80px; resize: vertical; }

  .help { font-size: 12px; color: ${colors.gray[400]}; margin-top: ${spacing[1]}; }
`;

const PreviewBox = styled.div`
  margin-top: ${spacing[2]};
  width: 100%;
  max-width: 300px;
  aspect-ratio: 16/9;
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  overflow: hidden;
  background: ${colors.gray[50]};
  display: flex;
  align-items: center;
  justify-content: center;
  img { width: 100%; height: 100%; object-fit: contain; }
  span { font-size: 12px; color: ${colors.gray[400]}; }
`;

const Toast = styled.div<{ $visible: boolean }>`
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 100;
  padding: 10px 20px;
  background: #16a34a;
  color: #fff;
  border-radius: ${borders.radius.lg};
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: ${shadows.lg};
  opacity: ${p => p.$visible ? 1 : 0};
  transform: translateY(${p => p.$visible ? 0 : -10}px);
  transition: all 0.3s;
  pointer-events: none;
`;

// Settings shape
interface SiteSettingsData {
  // General
  site_name: string;
  site_description: string;
  site_url: string;
  language: string;
  timezone: string;
  // Branding
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  // Contact
  contact_email: string;
  contact_phone: string;
  address: string;
  // Social
  facebook_url: string;
  instagram_url: string;
  twitter_url: string;
  linkedin_url: string;
  youtube_url: string;
  tiktok_url: string;
  // SEO
  meta_title: string;
  meta_description: string;
  og_image: string;
  google_analytics: string;
  google_tag_manager: string;
  // Advanced
  custom_head_code: string;
  custom_footer_code: string;
  maintenance_mode: string;
  robots_txt: string;
}

const DEFAULT_SETTINGS: SiteSettingsData = {
  site_name: '', site_description: '', site_url: '', language: 'pt', timezone: 'Europe/Lisbon',
  logo_url: '', favicon_url: '', primary_color: '#06B6D4', secondary_color: '#0891B2',
  contact_email: '', contact_phone: '', address: '',
  facebook_url: '', instagram_url: '', twitter_url: '', linkedin_url: '', youtube_url: '', tiktok_url: '',
  meta_title: '', meta_description: '', og_image: '', google_analytics: '', google_tag_manager: '',
  custom_head_code: '', custom_footer_code: '', maintenance_mode: 'false', robots_txt: 'User-agent: *\nAllow: /',
};

const COLLECTION_SLUG = 'site-settings';
const ENTRY_SLUG = 'global';

export const SiteSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SiteSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, []);

  const loadSettings = async () => {
    try {
      // Ensure collection exists
      let { data: col } = await supabase
        .from('collections')
        .select('id')
        .eq('slug', COLLECTION_SLUG)
        .maybeSingle();

      if (!col && user?.id) {
        const { data: newCol } = await supabase
          .from('collections')
          .insert({
            name: 'Site Settings',
            slug: COLLECTION_SLUG,
            description: 'Global website configuration',
            type: 'custom',
            fields: [],
            created_by: user.id,
          })
          .select('id')
          .single();
        col = newCol;
      }

      if (!col) { setLoading(false); return; }
      setCollectionId(col.id);

      // Load existing settings entry
      const { data: entry } = await supabase
        .from('entries')
        .select('id, content')
        .eq('collection_id', col.id)
        .eq('slug', ENTRY_SLUG)
        .maybeSingle();

      if (entry) {
        setEntryId(entry.id);
        setSettings({ ...DEFAULT_SETTINGS, ...(entry.content || {}) });
      }
    } catch (err) {
      console.error('Error loading site settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!collectionId || !user?.id) return;
    setSaving(true);

    try {
      if (entryId) {
        const { error } = await supabase
          .from('entries')
          .update({ content: settings, title: 'Global Settings', status: 'published' })
          .eq('id', entryId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('entries')
          .insert({
            collection_id: collectionId,
            title: 'Global Settings',
            slug: ENTRY_SLUG,
            content: settings,
            status: 'published',
            author_id: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        setEntryId(data.id);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof SiteSettingsData, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <Container><div style={{ padding: '80px 0', textAlign: 'center' }}><Loader size={32} style={{ animation: 'spin 1s linear infinite' }} /><p style={{ color: colors.gray[500], marginTop: 12 }}>Loading settings...</p><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div></Container>;
  }

  return (
    <Container>
      <Toast $visible={saved}><CheckCircle size={16} /> Settings saved</Toast>

      <Header>
        <div>
          <h1>Site Settings</h1>
          <p>Global configuration for your website</p>
        </div>
        <SaveBtn onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save /> Save Settings</>}
        </SaveBtn>
      </Header>

      {/* General */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: colors.accent[50], color: colors.accent[600] }}><Globe /></div>
          <h2>General</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field>
              <label>Site Name</label>
              <input value={settings.site_name} onChange={e => update('site_name', e.target.value)} placeholder="My Website" />
            </Field>
            <Field>
              <label>Site URL</label>
              <input value={settings.site_url} onChange={e => update('site_url', e.target.value)} placeholder="https://example.com" />
            </Field>
            <Field $full>
              <label>Site Description</label>
              <textarea value={settings.site_description} onChange={e => update('site_description', e.target.value)} placeholder="A brief description of your website" />
            </Field>
            <Field>
              <label>Language</label>
              <select value={settings.language} onChange={e => update('language', e.target.value)}>
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
              </select>
            </Field>
            <Field>
              <label>Timezone</label>
              <select value={settings.timezone} onChange={e => update('timezone', e.target.value)}>
                <option value="Europe/Lisbon">Europe/Lisbon (WET)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                <option value="America/New_York">America/New York (EST)</option>
                <option value="America/Sao_Paulo">America/São Paulo (BRT)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* Branding */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: '#fce7f3', color: '#be185d' }}><Palette /></div>
          <h2>Branding</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field>
              <label>Logo URL</label>
              <input value={settings.logo_url} onChange={e => update('logo_url', e.target.value)} placeholder="https://example.com/logo.png" />
              {settings.logo_url && <PreviewBox><img src={settings.logo_url} alt="Logo" /></PreviewBox>}
              {!settings.logo_url && <PreviewBox><span>No logo</span></PreviewBox>}
            </Field>
            <Field>
              <label>Favicon URL</label>
              <input value={settings.favicon_url} onChange={e => update('favicon_url', e.target.value)} placeholder="https://example.com/favicon.ico" />
              <p className="help">32x32 or 64x64 PNG/ICO recommended</p>
            </Field>
            <Field>
              <label>Primary Color</label>
              <div style={{ display: 'flex', gap: spacing[2], alignItems: 'center' }}>
                <input type="color" value={settings.primary_color} onChange={e => update('primary_color', e.target.value)} style={{ width: 40, height: 36, padding: 2, cursor: 'pointer' }} />
                <input value={settings.primary_color} onChange={e => update('primary_color', e.target.value)} placeholder="#06B6D4" style={{ flex: 1 }} />
              </div>
            </Field>
            <Field>
              <label>Secondary Color</label>
              <div style={{ display: 'flex', gap: spacing[2], alignItems: 'center' }}>
                <input type="color" value={settings.secondary_color} onChange={e => update('secondary_color', e.target.value)} style={{ width: 40, height: 36, padding: 2, cursor: 'pointer' }} />
                <input value={settings.secondary_color} onChange={e => update('secondary_color', e.target.value)} placeholder="#0891B2" style={{ flex: 1 }} />
              </div>
            </Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* Contact */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: '#dbeafe', color: '#2563eb' }}><Mail /></div>
          <h2>Contact Information</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field>
              <label>Email</label>
              <input type="email" value={settings.contact_email} onChange={e => update('contact_email', e.target.value)} placeholder="hello@example.com" />
            </Field>
            <Field>
              <label>Phone</label>
              <input value={settings.contact_phone} onChange={e => update('contact_phone', e.target.value)} placeholder="+351 900 000 000" />
            </Field>
            <Field $full>
              <label>Address</label>
              <textarea value={settings.address} onChange={e => update('address', e.target.value)} placeholder="Street, City, Country" style={{ minHeight: 60 }} />
            </Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* Social Media */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: '#fef3c7', color: '#d97706' }}><Share2 /></div>
          <h2>Social Media</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field><label>Facebook</label><input value={settings.facebook_url} onChange={e => update('facebook_url', e.target.value)} placeholder="https://facebook.com/..." /></Field>
            <Field><label>Instagram</label><input value={settings.instagram_url} onChange={e => update('instagram_url', e.target.value)} placeholder="https://instagram.com/..." /></Field>
            <Field><label>Twitter / X</label><input value={settings.twitter_url} onChange={e => update('twitter_url', e.target.value)} placeholder="https://x.com/..." /></Field>
            <Field><label>LinkedIn</label><input value={settings.linkedin_url} onChange={e => update('linkedin_url', e.target.value)} placeholder="https://linkedin.com/company/..." /></Field>
            <Field><label>YouTube</label><input value={settings.youtube_url} onChange={e => update('youtube_url', e.target.value)} placeholder="https://youtube.com/@..." /></Field>
            <Field><label>TikTok</label><input value={settings.tiktok_url} onChange={e => update('tiktok_url', e.target.value)} placeholder="https://tiktok.com/@..." /></Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* SEO */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: '#dcfce7', color: '#16a34a' }}><BarChart3 /></div>
          <h2>SEO & Analytics</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field $full>
              <label>Default Meta Title</label>
              <input value={settings.meta_title} onChange={e => update('meta_title', e.target.value)} placeholder="My Site — Tagline here" maxLength={60} />
              <p className="help">{settings.meta_title.length}/60 characters</p>
            </Field>
            <Field $full>
              <label>Default Meta Description</label>
              <textarea value={settings.meta_description} onChange={e => update('meta_description', e.target.value)} placeholder="A concise description for search engines..." maxLength={160} style={{ minHeight: 60 }} />
              <p className="help">{settings.meta_description.length}/160 characters</p>
            </Field>
            <Field>
              <label>Default OG Image URL</label>
              <input value={settings.og_image} onChange={e => update('og_image', e.target.value)} placeholder="https://example.com/og-image.jpg" />
              <p className="help">1200x630 recommended for social sharing</p>
            </Field>
            <Field>
              <label>Google Analytics ID</label>
              <input value={settings.google_analytics} onChange={e => update('google_analytics', e.target.value)} placeholder="G-XXXXXXXXXX" />
            </Field>
            <Field>
              <label>Google Tag Manager ID</label>
              <input value={settings.google_tag_manager} onChange={e => update('google_tag_manager', e.target.value)} placeholder="GTM-XXXXXXX" />
            </Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* Advanced */}
      <Section>
        <SectionHeader>
          <div className="icon" style={{ background: colors.gray[100], color: colors.gray[600] }}><Code /></div>
          <h2>Advanced</h2>
        </SectionHeader>
        <SectionBody>
          <FormGrid>
            <Field $full>
              <label>Custom Head Code</label>
              <textarea value={settings.custom_head_code} onChange={e => update('custom_head_code', e.target.value)} placeholder="<script>...</script> or <link>...</link>" style={{ fontFamily: typography.fontFamily.mono, fontSize: 13 }} />
              <p className="help">Injected before &lt;/head&gt; — use for custom scripts, fonts, etc.</p>
            </Field>
            <Field $full>
              <label>Custom Footer Code</label>
              <textarea value={settings.custom_footer_code} onChange={e => update('custom_footer_code', e.target.value)} placeholder="<script>...</script>" style={{ fontFamily: typography.fontFamily.mono, fontSize: 13 }} />
              <p className="help">Injected before &lt;/body&gt;</p>
            </Field>
            <Field $full>
              <label>robots.txt</label>
              <textarea value={settings.robots_txt} onChange={e => update('robots_txt', e.target.value)} style={{ fontFamily: typography.fontFamily.mono, fontSize: 13, minHeight: 60 }} />
            </Field>
            <Field>
              <label>Maintenance Mode</label>
              <select value={settings.maintenance_mode} onChange={e => update('maintenance_mode', e.target.value)}>
                <option value="false">Off — Site is live</option>
                <option value="true">On — Show maintenance page</option>
              </select>
            </Field>
          </FormGrid>
        </SectionBody>
      </Section>

      {/* Bottom save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: spacing[8] }}>
        <SaveBtn onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save /> Save Settings</>}
        </SaveBtn>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};
