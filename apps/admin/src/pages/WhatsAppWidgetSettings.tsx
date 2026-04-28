/**
 * WhatsApp Widget Settings — Admin configuration page.
 *
 * Edits a single entry (slug='config') in the 'whatsapp-widget' collection.
 * Includes a live preview that mirrors the embed widget's appearance.
 */

import { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  MessageCircle, Save, Loader, CheckCircle, Copy, Check,
  Eye, Code as CodeIcon, AlertCircle,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useI18n } from '../lib/i18n';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`max-width: 1200px; animation: ${fadeIn} 0.3s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[6]};
  display: flex; align-items: center; justify-content: space-between; gap: ${spacing[4]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; display: flex; align-items: center; gap: ${spacing[3]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
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

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: ${spacing[6]};
  @media (max-width: 1024px) { grid-template-columns: 1fr; }
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
  input, textarea, select {
    width: 100%; padding: ${spacing[3]}; border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md}; font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
  }
  textarea { min-height: 70px; resize: vertical; }
  .help { font-size: 12px; color: ${colors.gray[400]}; margin-top: ${spacing[1]}; }
  .row { display: flex; gap: ${spacing[2]}; align-items: center; }
  .check-row { display: flex; align-items: center; gap: ${spacing[2]}; padding: ${spacing[2]} 0; }
  .check-row input { width: auto; }
`;

const HoursGrid = styled.div`
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: ${spacing[2]};
  align-items: center;
  margin-top: ${spacing[2]};
  label { margin: 0; font-weight: 500; color: ${colors.gray[700]}; font-size: ${typography.fontSize.sm}; }
`;

const EmbedBox = styled.div`
  background: ${colors.gray[900]};
  color: #e6e6e6;
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  font-family: ${typography.fontFamily.mono};
  font-size: 13px;
  line-height: 1.6;
  position: relative;
  overflow-x: auto;
  white-space: pre;
  margin-top: ${spacing[3]};
  button {
    position: absolute; top: 10px; right: 10px;
    background: rgba(255,255,255,.1); color: #fff; border: none;
    padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
    display: flex; align-items: center; gap: 4px; font-family: ${typography.fontFamily.sans};
    &:hover { background: rgba(255,255,255,.2); }
  }
`;

// ── Preview pane (mimics the actual widget) ──
const PreviewPanel = styled.div`
  position: sticky; top: 20px;
  align-self: flex-start;
`;

const PreviewFrame = styled.div`
  background: linear-gradient(135deg, #f9fafb 0%, #ffffff 50%, #ecfeff 100%);
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: 0;
  height: 540px;
  position: relative;
  overflow: hidden;

  .preview-label {
    position: absolute; top: 12px; left: 12px;
    background: ${colors.gray[900]}; color: #fff; padding: 4px 10px;
    border-radius: 99px; font-size: 11px; font-weight: 600;
    display: flex; align-items: center; gap: 4px; z-index: 10;
  }
  .preview-label svg { width: 12px; height: 12px; }
`;

const Toast = styled.div<{ $v: boolean }>`
  position: fixed; top: 16px; right: 16px; z-index: 100;
  padding: 10px 20px; background: #16a34a; color: #fff; border-radius: ${borders.radius.lg};
  font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;
  box-shadow: ${shadows.lg}; opacity: ${p => p.$v ? 1 : 0}; transform: translateY(${p => p.$v ? 0 : -10}px);
  transition: all 0.3s; pointer-events: none;
`;

// ── Live preview component (no iframe — same DOM, scoped CSS) ──
const Demo = styled.div<{ $position: 'bottom-right' | 'bottom-left'; $color: string; $open: boolean }>`
  position: absolute; bottom: 16px;
  ${p => p.$position === 'bottom-right' ? 'right: 16px;' : 'left: 16px;'}
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;

  .demo-btn {
    width: 56px; height: 56px; border-radius: 50%;
    background: ${p => p.$color}; color: #fff; border: none;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,.18); cursor: pointer;
    position: relative;
  }
  .demo-btn svg { width: 28px; height: 28px; }

  .demo-bubble {
    position: absolute; top: -4px; right: -4px;
    background: #FF3B30; color: #fff; font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
  }

  .demo-popup {
    display: ${p => p.$open ? 'block' : 'none'};
    position: absolute;
    bottom: 70px;
    ${p => p.$position === 'bottom-right' ? 'right: 0;' : 'left: 0;'}
    width: 280px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 40px rgba(0,0,0,.25);
    overflow: hidden;
  }
  .demo-header {
    background: ${p => p.$color}; color: #fff; padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .demo-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,.25);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; overflow: hidden; flex-shrink: 0;
  }
  .demo-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .demo-meta { flex: 1; min-width: 0; }
  .demo-name { font-weight: 600; font-size: 13px; line-height: 1.2; }
  .demo-role { font-size: 11px; opacity: .85; margin-top: 1px; }
  .demo-status { font-size: 10px; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
  .demo-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #7CFC00; }
  .demo-status.offline::before { background: #aaa; }

  .demo-body { padding: 16px; background: #f7f7f5; }
  .demo-greeting {
    background: #fff; border-radius: 0 10px 10px 10px; padding: 10px 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,.06);
  }
  .demo-greeting strong { display: block; font-size: 12px; color: #222; margin-bottom: 3px; }
  .demo-greeting p { font-size: 11px; color: #555; margin: 0; line-height: 1.4; }

  .demo-cta {
    display: block; width: 100%; background: ${p => p.$color}; color: #fff;
    border: none; padding: 11px; border-radius: 8px; font-size: 13px;
    font-weight: 600; margin-top: 10px; text-align: center;
    font-family: inherit;
  }
`;

interface Config {
  enabled?: boolean;
  phone_number?: string;
  default_message?: string;
  position?: 'bottom-right' | 'bottom-left';
  button_color?: string;
  show_after_seconds?: number;
  show_on_mobile?: boolean;
  show_on_desktop?: boolean;
  agent_name?: string;
  agent_role?: string;
  agent_avatar?: string;
  greeting_title?: string;
  greeting_message?: string;
  cta_button_text?: string;
  use_working_hours?: boolean;
  working_hours_monday?: string;
  working_hours_tuesday?: string;
  working_hours_wednesday?: string;
  working_hours_thursday?: string;
  working_hours_friday?: string;
  working_hours_saturday?: string;
  working_hours_sunday?: string;
  working_hours_timezone?: string;
  offline_message?: string;
  show_bubble?: boolean;
  bubble_text?: string;
  bubble_delay_seconds?: number;
  require_consent?: boolean;
  consent_text?: string;
  track_clicks?: boolean;
}

const DEFAULTS: Config = {
  enabled: true,
  phone_number: '',
  default_message: '',
  position: 'bottom-right',
  button_color: '#25D366',
  show_after_seconds: 0,
  show_on_mobile: true,
  show_on_desktop: true,
  agent_name: '',
  agent_role: '',
  agent_avatar: '',
  greeting_title: 'Need help?',
  greeting_message: 'We typically reply within an hour.',
  cta_button_text: 'Start chat on WhatsApp',
  use_working_hours: false,
  working_hours_monday: '09:00-18:00',
  working_hours_tuesday: '09:00-18:00',
  working_hours_wednesday: '09:00-18:00',
  working_hours_thursday: '09:00-18:00',
  working_hours_friday: '09:00-18:00',
  working_hours_saturday: 'closed',
  working_hours_sunday: 'closed',
  working_hours_timezone: 'Europe/Lisbon',
  offline_message: 'We\'re offline. Leave a message and we\'ll get back to you.',
  show_bubble: false,
  bubble_text: '1',
  bubble_delay_seconds: 5,
  require_consent: false,
  consent_text: 'I agree my data will be transferred to WhatsApp.',
  track_clicks: false,
};

const COLLECTION_SLUG = 'whatsapp-widget';
const ENTRY_SLUG = 'config';

export const WhatsAppWidgetSettings = () => {
  const { user } = useAuth();
  const { locale } = useI18n();
  const toast = useToast();
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [apiKey, setApiKey] = useState<string>('YOUR_API_KEY');

  const t = (en: string, pt: string) => locale === 'pt' ? pt : en;

  useEffect(() => {
    load();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, []);

  const load = async () => {
    try {
      // Always treat as installed — addon settings page is reachable only when
      // the addon is enabled in /addons. The collection is created lazily on
      // first save (Addons page doesn't create collections for widget addons).
      setInstalled(true);

      const { data: cols } = await api.getCollections();
      const col = (cols || []).find((c: any) => c.slug === COLLECTION_SLUG);

      if (col) {
        setCollectionId(col.id);

        // Load existing config entry
        const { data: entries } = await api.getEntries(COLLECTION_SLUG);
        const configEntry = (entries || []).find((e: any) => e.slug === ENTRY_SLUG);
        if (configEntry) {
          setEntryId(configEntry.id);
          setConfig({ ...DEFAULTS, ...(configEntry.content || {}) });
        }
      }
      // If collection doesn't exist yet, just show empty form with defaults.
      // It'll be created on first save.

      // Try to fetch a public API key for the embed snippet
      try {
        const { data: keys } = await api.getApiKeys?.() || {};
        if (Array.isArray(keys) && keys.length > 0) {
          const live = keys.find((k: any) => k.key_prefix?.startsWith('kiban_live_'));
          if (live?.key_prefix) setApiKey(live.key_prefix);
        }
      } catch { /* ignore — embed will show placeholder */ }
    } catch (err) {
      console.error('[WhatsApp Widget] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.phone_number || !/^\+?[0-9]{8,15}$/.test(config.phone_number.replace(/\s/g, ''))) {
      toast.error(t('Phone number is required (international format)', 'Número de telefone obrigatório (formato internacional)'));
      return;
    }
    setSaving(true);
    try {
      // Lazy-create the collection on first save (Addons page doesn't create
      // collections for widget addons that have a settingsRoute).
      let resolvedCollectionId = collectionId;
      if (!resolvedCollectionId) {
        const addonDef = (await import('../config/addons-registry')).getAddon('whatsapp-widget');
        const colSpec = addonDef?.collections.find(c => c.slug === COLLECTION_SLUG);
        if (!colSpec) throw new Error('Add-on registry missing whatsapp-widget collection');
        const { error: createErr } = await api.createCollection({
          name: colSpec.name, slug: colSpec.slug, description: colSpec.description,
          type: colSpec.type, fields: colSpec.fields,
        });
        if (createErr && !createErr.includes('already exists')) throw new Error(createErr);
        const { data: cols } = await api.getCollections();
        const col = (cols || []).find((c: any) => c.slug === COLLECTION_SLUG);
        if (!col) throw new Error('Failed to create collection');
        resolvedCollectionId = col.id;
        setCollectionId(col.id);
      }

      if (entryId) {
        await api.updateEntry(COLLECTION_SLUG, ENTRY_SLUG, {
          title: 'WhatsApp Widget Config',
          content: config,
          status: 'published',
        });
      } else {
        await api.createEntry(COLLECTION_SLUG, {
          title: 'WhatsApp Widget Config',
          slug: ENTRY_SLUG,
          content: config,
          status: 'published',
        });
        // Re-fetch entry id
        const { data: entries } = await api.getEntries(COLLECTION_SLUG);
        const created = (entries || []).find((e: any) => e.slug === ENTRY_SLUG);
        if (created) setEntryId(created.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const embedSnippet = useMemo(() => {
    const origin = window.location.origin;
    return `<script src="${origin}/api/v1/whatsapp-widget/widget.js"\n        data-api-key="${apiKey}"\n        async></script>`;
  }, [apiKey]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  if (loading) {
    return (
      <Container>
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </Container>
    );
  }

  if (installed === false) {
    return (
      <Container>
        <Header>
          <div>
            <h1><MessageCircle size={28} color="#25D366" /> {t('WhatsApp Widget', 'Widget WhatsApp')}</h1>
          </div>
        </Header>
        <Section>
          <div style={{ display: 'flex', gap: spacing[3], alignItems: 'flex-start' }}>
            <AlertCircle size={24} color={colors.accent[500]} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <h2 style={{ margin: 0, paddingBottom: 0, borderBottom: 'none' }}>{t('Add-on not installed', 'Add-on não instalado')}</h2>
              <p style={{ marginTop: spacing[2], color: colors.gray[600], fontSize: typography.fontSize.sm }}>
                {t(
                  'Install the WhatsApp Chat Widget add-on first to start configuring it.',
                  'Instale primeiro o add-on WhatsApp Chat Widget para o configurar.'
                )}
              </p>
              <a
                href="/addons"
                style={{
                  display: 'inline-block', marginTop: spacing[4],
                  padding: `${spacing[2]} ${spacing[4]}`,
                  background: colors.accent[500], color: '#fff',
                  borderRadius: borders.radius.md, textDecoration: 'none',
                  fontSize: typography.fontSize.sm, fontWeight: 600,
                }}
              >{t('Go to Add-ons', 'Ir para Add-ons')}</a>
            </div>
          </div>
        </Section>
      </Container>
    );
  }

  const buttonColor = (config.button_color && /^#[0-9a-fA-F]{6}$/.test(config.button_color))
    ? config.button_color
    : '#25D366';

  return (
    <Container>
      <Toast $v={saved}><CheckCircle size={16} /> {t('Settings saved', 'Definições guardadas')}</Toast>

      <Header>
        <div>
          <h1><MessageCircle size={28} color="#25D366" /> {t('WhatsApp Widget', 'Widget WhatsApp')}</h1>
          <p>{t(
            'Configure the floating WhatsApp chat button for your frontend',
            'Configure o botão flutuante de chat WhatsApp para o frontend'
          )}</p>
        </div>
        <SaveBtn onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> {t('Saving...', 'A guardar...')}</> : <><Save size={18} /> {t('Save', 'Guardar')}</>}
        </SaveBtn>
      </Header>

      <Layout>
        <div>
          {/* Connection */}
          <Section>
            <h2>{t('Connection', 'Ligação')}</h2>
            <Grid>
              <Field $full>
                <div className="check-row">
                  <input
                    type="checkbox"
                    id="wa-enabled"
                    checked={config.enabled !== false}
                    onChange={e => update('enabled', e.target.checked)}
                  />
                  <label htmlFor="wa-enabled" style={{ margin: 0, fontWeight: 600 }}>
                    {t('Widget enabled', 'Widget activo')}
                  </label>
                </div>
                <p className="help">{t('Master switch — turn the widget on/off without removing the script', 'Interruptor geral — liga/desliga sem remover o script')}</p>
              </Field>

              <Field>
                <label>{t('Phone Number', 'Número de Telefone')} *</label>
                <input
                  type="tel"
                  value={config.phone_number || ''}
                  onChange={e => update('phone_number', e.target.value)}
                  placeholder="+351912345678"
                />
                <p className="help">{t('International format with + and country code', 'Formato internacional com + e código do país')}</p>
              </Field>

              <Field>
                <label>{t('Pre-filled Message', 'Mensagem Pré-preenchida')}</label>
                <input
                  type="text"
                  value={config.default_message || ''}
                  onChange={e => update('default_message', e.target.value)}
                  placeholder={t('Hi! I would like to know more about...', 'Olá! Gostaria de saber mais sobre...')}
                />
              </Field>
            </Grid>
          </Section>

          {/* Appearance */}
          <Section>
            <h2>{t('Appearance', 'Aparência')}</h2>
            <Grid>
              <Field>
                <label>{t('Position', 'Posição')}</label>
                <select
                  value={config.position || 'bottom-right'}
                  onChange={e => update('position', e.target.value as any)}
                >
                  <option value="bottom-right">{t('Bottom Right', 'Inferior Direito')}</option>
                  <option value="bottom-left">{t('Bottom Left', 'Inferior Esquerdo')}</option>
                </select>
              </Field>

              <Field>
                <label>{t('Button Color', 'Cor do Botão')}</label>
                <div className="row">
                  <input
                    type="color"
                    value={buttonColor}
                    onChange={e => update('button_color', e.target.value)}
                    style={{ width: 50, padding: 4, height: 38 }}
                  />
                  <input
                    type="text"
                    value={config.button_color || '#25D366'}
                    onChange={e => update('button_color', e.target.value)}
                    placeholder="#25D366"
                  />
                </div>
              </Field>

              <Field>
                <label>{t('Show after (seconds)', 'Mostrar após (segundos)')}</label>
                <input
                  type="number"
                  min="0"
                  value={config.show_after_seconds || 0}
                  onChange={e => update('show_after_seconds', Number(e.target.value))}
                />
                <p className="help">{t('Delay before the widget appears. 0 = immediately', 'Atraso antes de aparecer. 0 = imediato')}</p>
              </Field>

              <Field>
                <label>{t('Display on devices', 'Mostrar em dispositivos')}</label>
                <div className="check-row">
                  <input type="checkbox" id="wa-mobile" checked={config.show_on_mobile !== false} onChange={e => update('show_on_mobile', e.target.checked)} />
                  <label htmlFor="wa-mobile" style={{ margin: 0 }}>{t('Mobile', 'Móvel')}</label>
                </div>
                <div className="check-row">
                  <input type="checkbox" id="wa-desktop" checked={config.show_on_desktop !== false} onChange={e => update('show_on_desktop', e.target.checked)} />
                  <label htmlFor="wa-desktop" style={{ margin: 0 }}>{t('Desktop', 'Desktop')}</label>
                </div>
              </Field>
            </Grid>
          </Section>

          {/* Agent */}
          <Section>
            <h2>{t('Agent Identity', 'Identidade do Agente')}</h2>
            <Grid>
              <Field>
                <label>{t('Agent Name', 'Nome do Agente')}</label>
                <input
                  type="text"
                  value={config.agent_name || ''}
                  onChange={e => update('agent_name', e.target.value)}
                  placeholder="Maria"
                />
              </Field>

              <Field>
                <label>{t('Agent Role', 'Cargo')}</label>
                <input
                  type="text"
                  value={config.agent_role || ''}
                  onChange={e => update('agent_role', e.target.value)}
                  placeholder={t('Customer Support', 'Apoio ao Cliente')}
                />
              </Field>

              <Field $full>
                <label>{t('Avatar URL', 'URL do Avatar')}</label>
                <input
                  type="url"
                  value={config.agent_avatar || ''}
                  onChange={e => update('agent_avatar', e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
                <p className="help">{t('Square image (200x200 recommended). Falls back to initials.', 'Imagem quadrada (200x200 recomendado). Senão usa as iniciais.')}</p>
              </Field>
            </Grid>
          </Section>

          {/* Greeting */}
          <Section>
            <h2>{t('Greeting Message', 'Mensagem de Saudação')}</h2>
            <Grid>
              <Field>
                <label>{t('Title', 'Título')}</label>
                <input
                  type="text"
                  value={config.greeting_title || ''}
                  onChange={e => update('greeting_title', e.target.value)}
                  placeholder={t('Need help?', 'Precisa de ajuda?')}
                />
              </Field>

              <Field>
                <label>{t('CTA Button Text', 'Texto do Botão CTA')}</label>
                <input
                  type="text"
                  value={config.cta_button_text || ''}
                  onChange={e => update('cta_button_text', e.target.value)}
                  placeholder={t('Start chat on WhatsApp', 'Iniciar conversa no WhatsApp')}
                />
              </Field>

              <Field $full>
                <label>{t('Greeting Body', 'Corpo da Saudação')}</label>
                <textarea
                  value={config.greeting_message || ''}
                  onChange={e => update('greeting_message', e.target.value)}
                  placeholder={t('We typically reply within an hour.', 'Respondemos normalmente em menos de uma hora.')}
                />
              </Field>
            </Grid>
          </Section>

          {/* Working hours */}
          <Section>
            <h2>{t('Working Hours', 'Horário de Funcionamento')}</h2>
            <Field $full>
              <div className="check-row">
                <input
                  type="checkbox"
                  id="wa-hours"
                  checked={!!config.use_working_hours}
                  onChange={e => update('use_working_hours', e.target.checked)}
                />
                <label htmlFor="wa-hours" style={{ margin: 0, fontWeight: 600 }}>
                  {t('Enable working hours (show offline message outside hours)', 'Activar horário (mostrar offline fora do horário)')}
                </label>
              </div>
            </Field>

            {config.use_working_hours && (
              <>
                <HoursGrid>
                  {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map(day => {
                    const dayLabels: Record<string, [string, string]> = {
                      monday: ['Monday', 'Segunda'],
                      tuesday: ['Tuesday', 'Terça'],
                      wednesday: ['Wednesday', 'Quarta'],
                      thursday: ['Thursday', 'Quinta'],
                      friday: ['Friday', 'Sexta'],
                      saturday: ['Saturday', 'Sábado'],
                      sunday: ['Sunday', 'Domingo'],
                    };
                    const key = `working_hours_${day}` as keyof Config;
                    return (
                      <>
                        <label key={`l-${day}`}>{t(...dayLabels[day])}</label>
                        <input
                          key={day}
                          type="text"
                          value={(config[key] as string) || ''}
                          onChange={e => update(key as any, e.target.value as any)}
                          placeholder="09:00-18:00"
                        />
                      </>
                    );
                  })}
                </HoursGrid>

                <Grid style={{ marginTop: spacing[5] }}>
                  <Field>
                    <label>{t('Timezone', 'Fuso Horário')}</label>
                    <select
                      value={config.working_hours_timezone || 'Europe/Lisbon'}
                      onChange={e => update('working_hours_timezone', e.target.value)}
                    >
                      <option value="Europe/Lisbon">Europe/Lisbon</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="Europe/Madrid">Europe/Madrid</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="America/New_York">America/New York</option>
                      <option value="America/Sao_Paulo">America/Sao Paulo</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </Field>

                  <Field $full>
                    <label>{t('Offline Message', 'Mensagem Offline')}</label>
                    <textarea
                      value={config.offline_message || ''}
                      onChange={e => update('offline_message', e.target.value)}
                      placeholder={t('We\'re offline. Leave a message.', 'Estamos offline. Deixe uma mensagem.')}
                    />
                  </Field>
                </Grid>
              </>
            )}
          </Section>

          {/* Bubble */}
          <Section>
            <h2>{t('Notification Bubble', 'Bolha de Notificação')}</h2>
            <Field $full>
              <div className="check-row">
                <input
                  type="checkbox"
                  id="wa-bubble"
                  checked={!!config.show_bubble}
                  onChange={e => update('show_bubble', e.target.checked)}
                />
                <label htmlFor="wa-bubble" style={{ margin: 0, fontWeight: 600 }}>
                  {t('Show notification bubble on the button', 'Mostrar bolha de notificação no botão')}
                </label>
              </div>
            </Field>

            {config.show_bubble && (
              <Grid>
                <Field>
                  <label>{t('Bubble Text', 'Texto da Bolha')}</label>
                  <input
                    type="text"
                    value={config.bubble_text || '1'}
                    onChange={e => update('bubble_text', e.target.value)}
                    maxLength={3}
                    placeholder="1"
                  />
                </Field>
                <Field>
                  <label>{t('Show after (seconds)', 'Mostrar após (segundos)')}</label>
                  <input
                    type="number"
                    min="0"
                    value={config.bubble_delay_seconds || 5}
                    onChange={e => update('bubble_delay_seconds', Number(e.target.value))}
                  />
                </Field>
              </Grid>
            )}
          </Section>

          {/* Privacy & tracking */}
          <Section>
            <h2>{t('Privacy & Tracking', 'Privacidade e Rastreamento')}</h2>
            <Grid>
              <Field $full>
                <div className="check-row">
                  <input
                    type="checkbox"
                    id="wa-consent"
                    checked={!!config.require_consent}
                    onChange={e => update('require_consent', e.target.checked)}
                  />
                  <label htmlFor="wa-consent" style={{ margin: 0, fontWeight: 600 }}>
                    {t('Require GDPR consent before opening WhatsApp', 'Exigir consentimento RGPD antes de abrir o WhatsApp')}
                  </label>
                </div>
              </Field>

              {config.require_consent && (
                <Field $full>
                  <label>{t('Consent Text', 'Texto do Consentimento')}</label>
                  <textarea
                    value={config.consent_text || ''}
                    onChange={e => update('consent_text', e.target.value)}
                    placeholder={t('I agree my data will be transferred to WhatsApp.', 'Concordo que os meus dados sejam transferidos para o WhatsApp.')}
                  />
                  <p className="help">{t('Markdown links supported: [text](url)', 'Suporta links em markdown: [texto](url)')}</p>
                </Field>
              )}

              <Field $full>
                <div className="check-row">
                  <input
                    type="checkbox"
                    id="wa-tracking"
                    checked={!!config.track_clicks}
                    onChange={e => update('track_clicks', e.target.checked)}
                  />
                  <label htmlFor="wa-tracking" style={{ margin: 0, fontWeight: 600 }}>
                    {t('Track clicks (push event to dataLayer for GA/GTM)', 'Rastrear cliques (envia evento para dataLayer GA/GTM)')}
                  </label>
                </div>
                <p className="help">{t(
                  'Event name: "whatsapp_widget_click"',
                  'Nome do evento: "whatsapp_widget_click"'
                )}</p>
              </Field>
            </Grid>
          </Section>

          {/* Embed code */}
          <Section>
            <h2>{t('Embed on Frontend', 'Embed no Frontend')}</h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], margin: 0 }}>
              {t(
                'Copy this single line and paste it before the closing </body> tag of your frontend site:',
                'Copie esta linha e cole-a antes da tag </body> do site frontend:'
              )}
            </p>
            <EmbedBox>
              <button onClick={handleCopy}>
                {copied ? <><Check size={14} /> {t('Copied', 'Copiado')}</> : <><Copy size={14} /> {t('Copy', 'Copiar')}</>}
              </button>
              {embedSnippet}
            </EmbedBox>
            {apiKey === 'YOUR_API_KEY' && (
              <p style={{ fontSize: 12, color: colors.gray[500], marginTop: spacing[3] }}>
                <AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {t(
                  'Generate an API key in Settings → API to replace the placeholder.',
                  'Crie uma API key em Definições → API para substituir o placeholder.'
                )}
              </p>
            )}
          </Section>
        </div>

        {/* Live preview */}
        <PreviewPanel>
          <PreviewFrame>
            <div className="preview-label">
              <Eye /> {t('Live Preview', 'Pré-visualização')}
            </div>

            <div style={{ position: 'absolute', inset: 0, padding: spacing[6], display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ color: colors.gray[400], fontSize: 12, textAlign: 'center', paddingBottom: spacing[8] }}>
                {t('Click the button to toggle popup', 'Clique no botão para abrir/fechar')}
              </div>
            </div>

            <Demo $position={config.position || 'bottom-right'} $color={buttonColor} $open={previewOpen}>
              <div className="demo-popup">
                <div className="demo-header">
                  <div className="demo-avatar">
                    {config.agent_avatar
                      ? <img src={config.agent_avatar} alt="" />
                      : (config.agent_name || 'WA').slice(0, 2).toUpperCase()
                    }
                  </div>
                  <div className="demo-meta">
                    <div className="demo-name">{config.agent_name || 'WhatsApp'}</div>
                    {config.agent_role && <div className="demo-role">{config.agent_role}</div>}
                    <div className="demo-status">Online</div>
                  </div>
                </div>
                <div className="demo-body">
                  <div className="demo-greeting">
                    <strong>{config.greeting_title || 'Need help?'}</strong>
                    <p>{config.greeting_message || 'Send us a message — we\'ll reply as soon as possible.'}</p>
                  </div>
                  <div className="demo-cta">{config.cta_button_text || 'Start chat on WhatsApp'}</div>
                </div>
              </div>

              <button className="demo-btn" onClick={() => setPreviewOpen(o => !o)} aria-label="Toggle preview">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.88 11.9L4 20l4.2-1.1a7.93 7.93 0 0 0 3.85.98h.01a7.94 7.94 0 0 0 5.54-13.56zM12.05 18.5h-.01a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.22-3.5 6.6 6.6 0 0 1-6.62 6.59zm3.62-4.94c-.2-.1-1.17-.58-1.35-.65-.18-.07-.31-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.84-.31-1.6-.99-.59-.53-.99-1.18-1.1-1.38-.12-.2-.01-.31.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.61-1.47-.16-.39-.33-.34-.45-.34l-.39-.01a.74.74 0 0 0-.54.25c-.18.2-.7.69-.7 1.67 0 .98.71 1.93.81 2.07.1.13 1.4 2.13 3.39 2.99.47.2.84.32 1.13.42.47.15.9.13 1.24.08.38-.06 1.17-.48 1.33-.94.16-.46.16-.86.12-.94-.04-.08-.18-.13-.38-.23z"/></svg>
                {config.show_bubble && config.bubble_text && <span className="demo-bubble">{config.bubble_text}</span>}
              </button>
            </Demo>
          </PreviewFrame>
        </PreviewPanel>
      </Layout>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};
