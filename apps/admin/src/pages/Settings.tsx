/**
 * Unified Settings Page — WordPress-style tabs
 * Merges: General (Site Settings) + API + Media + Permalinks + Privacy + Email
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  Globe, Key, Image as ImageIcon, Link2, Shield, Mail,
  Copy, Check, Save, Loader, CheckCircle,
  Plus, Trash2, X,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useI18n, type Locale } from '../lib/i18n';
import { useAuth } from '../features/auth/hooks/useAuth';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`max-width: 1000px; animation: ${fadeIn} 0.3s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[6]};
  display: flex; align-items: center; justify-content: space-between;
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0; }
`;

const SaveBtn = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]}; color: #fff; border: none;
  border-radius: ${borders.radius.lg}; font-size: ${typography.fontSize.sm}; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  &:hover:not(:disabled) { background: ${colors.accent[600]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  svg { width: 18px; height: 18px; }
`;

const TabNav = styled.div`
  display: flex; gap: ${spacing[1]}; margin-bottom: ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]}; flex-wrap: wrap;
`;

const Tab = styled.button<{ $active?: boolean }>`
  padding: ${spacing[3]} ${spacing[4]};
  border: none; background: none; cursor: pointer;
  font-size: ${typography.fontSize.sm}; font-weight: ${p => p.$active ? 600 : 500};
  color: ${p => p.$active ? colors.accent[600] : colors.gray[500]};
  border-bottom: 2px solid ${p => p.$active ? colors.accent[500] : 'transparent'};
  display: flex; align-items: center; gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  margin-bottom: -1px;
  &:hover { color: ${colors.gray[900]}; }
  svg { width: 16px; height: 16px; }
`;

const Section = styled.div`
  background: ${colors.white}; border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl}; padding: ${spacing[6]}; margin-bottom: ${spacing[5]};
  h2 { font-size: ${typography.fontSize.base}; font-weight: 600; margin: 0 0 ${spacing[5]}; padding-bottom: ${spacing[4]}; border-bottom: 1px solid ${colors.gray[100]}; }
`;

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: ${spacing[4]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Field = styled.div<{ $full?: boolean }>`
  ${p => p.$full && 'grid-column: 1 / -1;'}
  label { display: block; font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[700]}; margin-bottom: ${spacing[2]}; }
  input, textarea, select { width: 100%; padding: ${spacing[3]}; border: 1px solid ${colors.gray[300]}; border-radius: ${borders.radius.md}; font-size: ${typography.fontSize.sm}; font-family: ${typography.fontFamily.sans}; &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; } }
  textarea { min-height: 80px; resize: vertical; }
  .help { font-size: 12px; color: ${colors.gray[400]}; margin-top: ${spacing[1]}; }
`;

const KeyCard = styled.div`
  background: ${colors.gray[50]}; border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg}; padding: ${spacing[4]}; margin-bottom: ${spacing[3]};
  &:last-child { margin-bottom: 0; }
  h3 { font-size: ${typography.fontSize.sm}; font-weight: 600; margin: 0 0 ${spacing[2]}; }
  .key-row { display: flex; align-items: center; gap: ${spacing[2]}; margin-bottom: ${spacing[2]}; }
  code { flex: 1; font-family: ${typography.fontFamily.mono}; font-size: 13px; background: ${colors.white}; border: 1px solid ${colors.gray[300]}; border-radius: ${borders.radius.md}; padding: ${spacing[2]} ${spacing[3]}; word-break: break-all; }
  .key-meta { font-size: 12px; color: ${colors.gray[500]}; display: flex; gap: ${spacing[4]}; }
`;

const IconBtn = styled.button`
  padding: ${spacing[2]}; background: ${colors.white}; border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md}; cursor: pointer; display: flex; color: ${colors.gray[600]};
  &:hover { background: ${colors.gray[50]}; }
  svg { width: 16px; height: 16px; }
`;

const GenerateBtn = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]}; color: #fff; border: none;
  border-radius: ${borders.radius.lg}; font-size: ${typography.fontSize.sm}; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  &:hover:not(:disabled) { background: ${colors.accent[600]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  svg { width: 18px; height: 18px; }
`;

const RevokeBtn = styled.button`
  padding: ${spacing[1]} ${spacing[3]};
  background: none; color: ${colors.gray[400]}; border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md}; font-size: 12px; font-weight: 500;
  cursor: pointer; display: flex; align-items: center; gap: ${spacing[1]};
  font-family: ${typography.fontFamily.sans};
  &:hover { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
  svg { width: 14px; height: 14px; }
`;

const ModalOverlay = styled.div`
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: ${fadeIn} 0.2s ease-out;
`;

const ModalBox = styled.div`
  background: ${colors.white}; border-radius: ${borders.radius.xl};
  padding: ${spacing[6]}; max-width: 560px; width: 90%;
  box-shadow: ${shadows.xl};
  h3 { font-size: ${typography.fontSize.lg}; font-weight: 600; margin: 0 0 ${spacing[4]}; }
`;

const NewKeyDisplay = styled.div`
  background: #f0fdf4; border: 2px solid #86efac; border-radius: ${borders.radius.lg};
  padding: ${spacing[4]}; margin: ${spacing[4]} 0;
  code { display: block; font-family: ${typography.fontFamily.mono}; font-size: 14px;
    word-break: break-all; color: #166534; line-height: 1.6; user-select: all; }
`;

const Toast = styled.div<{ $v: boolean }>`
  position: fixed; top: 16px; right: 16px; z-index: 100;
  padding: 10px 20px; background: #16a34a; color: #fff; border-radius: ${borders.radius.lg};
  font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;
  box-shadow: ${shadows.lg}; opacity: ${p => p.$v ? 1 : 0}; transform: translateY(${p => p.$v ? 0 : -10}px);
  transition: all 0.3s; pointer-events: none;
`;

const TABS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'api', label: 'API', icon: Key },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'permalinks', label: 'Permalinks', icon: Link2 },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'email', label: 'Email', icon: Mail },
];

interface SiteSettings {
  site_name: string; site_description: string; site_url: string; language: string; timezone: string;
  logo_url: string; favicon_url: string; primary_color: string; secondary_color: string;
  contact_email: string; contact_phone: string; address: string;
  facebook_url: string; instagram_url: string; twitter_url: string; linkedin_url: string; youtube_url: string; tiktok_url: string;
  meta_title: string; meta_description: string; og_image: string;
  google_analytics: string; google_tag_manager: string;
  custom_head_code: string; custom_footer_code: string; maintenance_mode: string; robots_txt: string;
  // Media
  max_upload_mb: string; allowed_types: string; thumbnail_width: string; thumbnail_height: string;
  // Permalinks
  entry_url_pattern: string; collection_url_pattern: string;
  // Privacy
  privacy_policy_url: string; data_retention_days: string; cookie_consent: string; gdpr_contact: string;
  // Email
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_from: string; smtp_from_name: string;
}

const DEFAULTS: SiteSettings = {
  site_name: '', site_description: '', site_url: '', language: 'pt', timezone: 'Europe/Lisbon',
  logo_url: '', favicon_url: '', primary_color: '#06B6D4', secondary_color: '#0891B2',
  contact_email: '', contact_phone: '', address: '',
  facebook_url: '', instagram_url: '', twitter_url: '', linkedin_url: '', youtube_url: '', tiktok_url: '',
  meta_title: '', meta_description: '', og_image: '',
  google_analytics: '', google_tag_manager: '',
  custom_head_code: '', custom_footer_code: '', maintenance_mode: 'false', robots_txt: 'User-agent: *\nAllow: /',
  max_upload_mb: '50', allowed_types: 'image/*,video/*,audio/*,.pdf', thumbnail_width: '300', thumbnail_height: '300',
  entry_url_pattern: '/{collection}/{slug}', collection_url_pattern: '/{slug}',
  privacy_policy_url: '', data_retention_days: '365', cookie_consent: 'false', gdpr_contact: '',
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_from: '', smtp_from_name: '',
};

interface ApiKey { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; }

export const Settings = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general');
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const switchTab = (id: string) => { setActiveTab(id); setSearchParams({ tab: id }); };

  const handleGenerateKey = async () => {
    if (!user?.id) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_new_api_key_for_user', {
        user_profile_id: user.id,
        key_name: newKeyName.trim() || 'API Key',
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.api_key) {
        setGeneratedKey(row.api_key);
        await loadAll();
      } else {
        throw new Error('No key returned. Ensure migration 008 has been applied.');
      }
    } catch (err: any) {
      toast.error('Failed to generate key: ' + (err.message || 'Unknown error'));
      setShowGenerateModal(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setRevokingId(keyId);
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', keyId);
      if (error) throw error;
      setApiKeys((prev: ApiKey[]) => prev.filter((k: ApiKey) => k.id !== keyId));
      toast.success('API key revoked');
    } catch (err: any) {
      toast.error('Failed to revoke: ' + (err.message || 'Unknown error'));
    } finally {
      setRevokingId(null);
    }
  };

  const closeGenerateModal = () => {
    setShowGenerateModal(false);
    setGeneratedKey(null);
    setNewKeyName('');
  };
  const update = (key: keyof SiteSettings, value: string) => setSettings(prev => ({ ...prev, [key]: value }));
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

  useEffect(() => {
    loadAll();
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, [user?.id]);

  const loadAll = async () => {
    try {
      // Load site settings via API
      const { data: entryData } = await api.getEntries('site-settings');
      const globalEntry = (entryData || []).find((e: any) => e.slug === 'global');
      if (globalEntry?.content) setSettings({ ...DEFAULTS, ...globalEntry.content });

      // Load API keys (Supabase direct — table may not exist)
      if (user?.id) {
        try {
          const { data: keys } = await supabase.from('api_keys').select('*').eq('profile_id', user.id).is('revoked_at', null).order('created_at', { ascending: false });
          setApiKeys(keys || []);
        } catch { /* api_keys table may not exist — ignore */ }
      }
    } catch (err) {
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Ensure collection exists
      const { data: cols } = await api.getCollections();
      const exists = (cols || []).find((c: any) => c.slug === 'site-settings');
      if (!exists) {
        await api.createCollection({ name: 'Site Settings', slug: 'site-settings', description: 'Global configuration', type: 'custom', fields: [] });
      }

      // Check if entry exists
      const { data: entries } = await api.getEntries('site-settings');
      const globalEntry = (entries || []).find((e: any) => e.slug === 'global');

      if (globalEntry) {
        await api.updateEntry('site-settings', 'global', { title: 'Global Settings', content: settings, status: 'published' });
      } else {
        await api.createEntry('site-settings', { title: 'Global Settings', slug: 'global', content: settings, status: 'published' });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Container><div style={{ padding: '80px 0', textAlign: 'center' }}><Loader size={32} style={{ animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div></Container>;
  }

  return (
    <Container>
      <Toast $v={saved}><CheckCircle size={16} /> Settings saved</Toast>

      <Header>
        <h1>{t('settings.title')}</h1>
        {activeTab !== 'api' && (
          <SaveBtn onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'pt' ? 'A guardar...' : 'Saving...'}</> : <><Save size={18} /> {t('settings.save')}</>}
          </SaveBtn>
        )}
      </Header>

      <TabNav>
        {TABS.map(tab => (
          <Tab key={tab.id} $active={activeTab === tab.id} onClick={() => switchTab(tab.id)}>
            <tab.icon /> {t(`settings.${tab.id}`)}
          </Tab>
        ))}
      </TabNav>

      {/* ── GENERAL ── */}
      {activeTab === 'general' && (
        <>
          <Section>
            <h2>{locale === 'pt' ? 'Idioma da Interface' : 'Interface Language'}</h2>
            <Grid>
              <Field>
                <label>{locale === 'pt' ? 'Idioma do Painel' : 'Admin Language'}</label>
                <select value={locale} onChange={e => setLocale(e.target.value as Locale)}>
                  <option value="pt">Português (PT)</option>
                  <option value="en">English (EN)</option>
                </select>
                <p className="help">{locale === 'pt' ? 'Afeta todo o painel de administração' : 'Affects the entire admin panel'}</p>
              </Field>
            </Grid>
          </Section>

          <Section>
            <h2>{locale === 'pt' ? 'Projeto' : 'Project'}</h2>
            <Grid>
              <Field><label>{locale === 'pt' ? 'Nome do Site' : 'Site Name'}</label><input value={settings.site_name} onChange={e => update('site_name', e.target.value)} placeholder="My Website" /></Field>
              <Field><label>{locale === 'pt' ? 'URL do Site' : 'Site URL'}</label><input value={settings.site_url} onChange={e => update('site_url', e.target.value)} placeholder="https://example.com" /></Field>
              <Field><label>{locale === 'pt' ? 'Fuso Horário' : 'Timezone'}</label><select value={settings.timezone} onChange={e => update('timezone', e.target.value)}><option value="Europe/Lisbon">Europe/Lisbon</option><option value="Europe/London">Europe/London</option><option value="Europe/Paris">Europe/Paris</option><option value="America/New_York">America/New York</option><option value="America/Sao_Paulo">America/São Paulo</option><option value="UTC">UTC</option></select></Field>
              <Field><label>Maintenance Mode</label><select value={settings.maintenance_mode} onChange={e => update('maintenance_mode', e.target.value)}><option value="false">Off</option><option value="true">On</option></select></Field>
            </Grid>
          </Section>
        </>
      )}

      {/* ── API ── */}
      {activeTab === 'api' && (
        <>
          <Section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[5], paddingBottom: spacing[4], borderBottom: `1px solid ${colors.gray[100]}` }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>API Keys</h2>
              <GenerateBtn onClick={() => setShowGenerateModal(true)}>
                <Plus /> {locale === 'pt' ? 'Gerar Nova Key' : 'Generate New Key'}
              </GenerateBtn>
            </div>
            <div style={{ padding: `${spacing[3]} ${spacing[4]}`, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: borders.radius.lg, marginBottom: spacing[4], fontSize: typography.fontSize.sm, color: '#1e40af' }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>{locale === 'pt' ? 'Mantenha as suas API keys seguras' : 'Keep your API keys secure'}</strong>
              {locale === 'pt'
                ? 'As API keys permitem que apps frontend acedam ao conteúdo. Nunca as exponha em código client-side.'
                : 'API keys allow frontend apps to fetch content. Never expose them in client-side code.'}
            </div>
            {apiKeys.length === 0 ? (
              <p style={{ color: colors.gray[500], textAlign: 'center', padding: spacing[8] }}>
                {locale === 'pt' ? 'Nenhuma API key encontrada. Clique em "Gerar Nova Key" para criar uma.' : 'No API keys found. Click "Generate New Key" to create one.'}
              </p>
            ) : apiKeys.map(key => (
              <KeyCard key={key.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2] }}>
                  <h3 style={{ margin: 0 }}>{key.name}</h3>
                  <RevokeBtn
                    onClick={() => { if (window.confirm(locale === 'pt' ? `Revogar a key "${key.name}"? Esta ação é irreversível.` : `Revoke key "${key.name}"? This cannot be undone.`)) handleRevokeKey(key.id); }}
                    disabled={revokingId === key.id}
                  >
                    {revokingId === key.id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 />}
                    {locale === 'pt' ? 'Revogar' : 'Revoke'}
                  </RevokeBtn>
                </div>
                <div className="key-row">
                  <code>{key.key_prefix}</code>
                  <IconBtn onClick={() => { navigator.clipboard.writeText(key.key_prefix); setCopiedId(key.id); setTimeout(() => setCopiedId(null), 2000); }}>{copiedId === key.id ? <Check /> : <Copy />}</IconBtn>
                </div>
                <div className="key-meta"><span>{locale === 'pt' ? 'Criada' : 'Created'}: {fmt(key.created_at)}</span><span>{locale === 'pt' ? 'Última utilização' : 'Last used'}: {fmt(key.last_used_at)}</span></div>
              </KeyCard>
            ))}
          </Section>

          {/* Generate Key Modal */}
          {showGenerateModal && (
            <ModalOverlay onClick={() => { if (!generatedKey) closeGenerateModal(); }}>
              <ModalBox onClick={e => e.stopPropagation()}>
                {generatedKey ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ color: '#166534' }}>{locale === 'pt' ? 'Key Gerada com Sucesso!' : 'Key Generated Successfully!'}</h3>
                      <IconBtn onClick={closeGenerateModal}><X /></IconBtn>
                    </div>
                    <div style={{ padding: `${spacing[3]} ${spacing[4]}`, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: borders.radius.lg, marginBottom: spacing[3], fontSize: typography.fontSize.sm, color: '#92400e' }}>
                      <strong>{locale === 'pt' ? 'Copie agora!' : 'Copy it now!'}</strong>{' '}
                      {locale === 'pt'
                        ? 'Esta é a ÚNICA vez que a key completa será mostrada. Não é possível recuperá-la depois.'
                        : 'This is the ONLY time the full key will be shown. It cannot be recovered later.'}
                    </div>
                    <NewKeyDisplay>
                      <code>{generatedKey}</code>
                    </NewKeyDisplay>
                    <div style={{ display: 'flex', gap: spacing[3] }}>
                      <GenerateBtn
                        onClick={() => { navigator.clipboard.writeText(generatedKey); setCopiedId('new'); setTimeout(() => setCopiedId(null), 2000); }}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        {copiedId === 'new' ? <><Check /> {locale === 'pt' ? 'Copiada!' : 'Copied!'}</> : <><Copy /> {locale === 'pt' ? 'Copiar Key' : 'Copy Key'}</>}
                      </GenerateBtn>
                      <SaveBtn onClick={closeGenerateModal} style={{ flex: 1, justifyContent: 'center', background: colors.gray[600] }}>
                        {locale === 'pt' ? 'Fechar' : 'Close'}
                      </SaveBtn>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3>{locale === 'pt' ? 'Gerar Nova API Key' : 'Generate New API Key'}</h3>
                      <IconBtn onClick={closeGenerateModal}><X /></IconBtn>
                    </div>
                    <Field style={{ marginBottom: spacing[4] }}>
                      <label>{locale === 'pt' ? 'Nome da Key' : 'Key Name'}</label>
                      <input
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder={locale === 'pt' ? 'Ex: Website Solfil' : 'E.g.: My Frontend App'}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleGenerateKey(); }}
                      />
                      <p className="help">{locale === 'pt' ? 'Um nome descritivo para identificar onde esta key é usada.' : 'A descriptive name to identify where this key is used.'}</p>
                    </Field>
                    <GenerateBtn onClick={handleGenerateKey} disabled={generating} style={{ width: '100%', justifyContent: 'center' }}>
                      {generating ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'pt' ? 'A gerar...' : 'Generating...'}</> : <><Key /> {locale === 'pt' ? 'Gerar API Key' : 'Generate API Key'}</>}
                    </GenerateBtn>
                  </>
                )}
              </ModalBox>
            </ModalOverlay>
          )}
        </>
      )}

      {/* ── MEDIA ── */}
      {activeTab === 'media' && (
        <Section>
          <h2>Media Settings</h2>
          <Grid>
            <Field><label>Max Upload Size (MB)</label><input type="number" value={settings.max_upload_mb} onChange={e => update('max_upload_mb', e.target.value)} /></Field>
            <Field><label>Allowed File Types</label><input value={settings.allowed_types} onChange={e => update('allowed_types', e.target.value)} /><p className="help">Comma-separated MIME types or patterns</p></Field>
            <Field><label>Thumbnail Width (px)</label><input type="number" value={settings.thumbnail_width} onChange={e => update('thumbnail_width', e.target.value)} /></Field>
            <Field><label>Thumbnail Height (px)</label><input type="number" value={settings.thumbnail_height} onChange={e => update('thumbnail_height', e.target.value)} /></Field>
          </Grid>
        </Section>
      )}

      {/* ── PERMALINKS ── */}
      {activeTab === 'permalinks' && (
        <Section>
          <h2>URL Structure</h2>
          <Grid>
            <Field $full><label>Entry URL Pattern</label><input value={settings.entry_url_pattern} onChange={e => update('entry_url_pattern', e.target.value)} /><p className="help">Variables: {'{collection}'}, {'{slug}'}, {'{id}'}</p></Field>
            <Field $full><label>Collection URL Pattern</label><input value={settings.collection_url_pattern} onChange={e => update('collection_url_pattern', e.target.value)} /><p className="help">Variables: {'{slug}'}</p></Field>
          </Grid>
        </Section>
      )}

      {/* ── PRIVACY ── */}
      {activeTab === 'privacy' && (
        <Section>
          <h2>Privacy & GDPR</h2>
          <Grid>
            <Field $full><label>Privacy Policy URL</label><input value={settings.privacy_policy_url} onChange={e => update('privacy_policy_url', e.target.value)} placeholder="https://example.com/privacy" /></Field>
            <Field><label>Data Retention (days)</label><input type="number" value={settings.data_retention_days} onChange={e => update('data_retention_days', e.target.value)} /><p className="help">How long to keep form submissions and logs</p></Field>
            <Field><label>Cookie Consent</label><select value={settings.cookie_consent} onChange={e => update('cookie_consent', e.target.value)}><option value="false">Disabled</option><option value="true">Enabled</option></select></Field>
            <Field $full><label>GDPR Contact Email</label><input value={settings.gdpr_contact} onChange={e => update('gdpr_contact', e.target.value)} placeholder="dpo@example.com" /><p className="help">Data Protection Officer or privacy contact</p></Field>
          </Grid>
        </Section>
      )}

      {/* ── EMAIL ── */}
      {activeTab === 'email' && (
        <Section>
          <h2>Email / SMTP Configuration</h2>
          <div style={{ padding: `${spacing[3]} ${spacing[4]}`, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: borders.radius.lg, marginBottom: spacing[4], fontSize: typography.fontSize.sm, color: '#92400e' }}>
            Configure SMTP to send emails from the Newsletter add-on and form notifications.
          </div>
          <Grid>
            <Field><label>SMTP Host</label><input value={settings.smtp_host} onChange={e => update('smtp_host', e.target.value)} placeholder="smtp.gmail.com" /></Field>
            <Field><label>SMTP Port</label><input value={settings.smtp_port} onChange={e => update('smtp_port', e.target.value)} placeholder="587" /></Field>
            <Field><label>SMTP Username</label><input value={settings.smtp_user} onChange={e => update('smtp_user', e.target.value)} placeholder="user@gmail.com" /></Field>
            <Field><label>From Email</label><input value={settings.smtp_from} onChange={e => update('smtp_from', e.target.value)} placeholder="noreply@example.com" /></Field>
            <Field><label>From Name</label><input value={settings.smtp_from_name} onChange={e => update('smtp_from_name', e.target.value)} placeholder="kibanCMS" /></Field>
          </Grid>
        </Section>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};
