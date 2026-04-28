/**
 * Newsletter Configuration — Brevo (sendinblue) integration.
 *
 * Subscribers collected via /api/v1/newsletter/subscribe stay in the CMS
 * for audit/backup AND get pushed to Brevo (the agency's preferred email
 * platform). Campaign creation, scheduling, and analytics happen in Brevo.
 *
 * Configuration is persisted to addon_configs[addon_id='newsletter'].config:
 *   - brevo_api_key       (xkeysib-...)
 *   - brevo_list_id       (numeric — selected from fetched lists)
 *   - sync_mode           ('realtime' | 'manual')
 *   - brevo_double_opt_in (bool)
 *   - enabled             (bool — addon active)
 */

import { useEffect, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Mail, Save, Loader, CheckCircle, AlertCircle, Eye, EyeOff,
  RefreshCw, Plug, Users as UsersIcon, ExternalLink, Zap,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`max-width: 880px; animation: ${fadeIn} 0.3s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[6]};
  display: flex; align-items: center; justify-content: space-between; gap: ${spacing[4]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; display: flex; align-items: center; gap: ${spacing[3]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; max-width: 640px; line-height: 1.5; }
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

const Section = styled.div`
  background: ${colors.white}; border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl}; padding: ${spacing[6]}; margin-bottom: ${spacing[5]};
  h2 { font-size: ${typography.fontSize.base}; font-weight: 600; margin: 0 0 ${spacing[5]}; padding-bottom: ${spacing[4]}; border-bottom: 1px solid ${colors.gray[100]}; display: flex; align-items: center; gap: ${spacing[2]}; }
`;

const InfoCard = styled.div<{ $variant?: 'info' | 'success' | 'warning' }>`
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};
  font-size: ${typography.fontSize.sm};
  line-height: 1.5;

  ${p => {
    const variant = p.$variant || 'info';
    if (variant === 'success') return `background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;`;
    if (variant === 'warning') return `background: #fffbeb; border: 1px solid #fde68a; color: #92400e;`;
    return `background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;`;
  }}

  svg { flex-shrink: 0; margin-top: 2px; }
  strong { display: block; margin-bottom: 2px; }
  a { color: inherit; text-decoration: underline; }
`;

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: ${spacing[4]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Field = styled.div<{ $full?: boolean }>`
  ${p => p.$full && 'grid-column: 1 / -1;'}
  label { display: block; font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[700]}; margin-bottom: ${spacing[2]}; }
  input, select, textarea {
    width: 100%; padding: ${spacing[3]}; border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md}; font-size: ${typography.fontSize.sm};
    font-family: ${typography.fontFamily.sans};
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
  }
  .help { font-size: 12px; color: ${colors.gray[400]}; margin-top: ${spacing[1]}; line-height: 1.4; }
  .row { display: flex; gap: ${spacing[2]}; align-items: stretch; }
  .row input { flex: 1; }
  .check-row { display: flex; align-items: center; gap: ${spacing[2]}; padding: ${spacing[2]} 0; }
  .check-row input { width: auto; }
`;

const SecondaryBtn = styled.button`
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.white}; color: ${colors.gray[700]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md}; font-size: ${typography.fontSize.sm}; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  white-space: nowrap;
  &:hover:not(:disabled) { background: ${colors.gray[50]}; border-color: ${colors.gray[400]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  svg { width: 14px; height: 14px; }
`;

const StatsGrid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${spacing[3]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Stat = styled.div<{ $variant?: 'success' | 'error' | 'neutral' }>`
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  .stat-label { font-size: 11px; font-weight: 600; color: ${colors.gray[500]}; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat-value {
    font-size: ${typography.fontSize['2xl']}; font-weight: 700; margin-top: 4px;
    color: ${p =>
      p.$variant === 'success' ? '#16a34a' :
      p.$variant === 'error' ? '#dc2626' :
      colors.gray[900]
    };
  }
`;

const Toast = styled.div<{ $v: boolean }>`
  position: fixed; top: 16px; right: 16px; z-index: 100;
  padding: 10px 20px; background: #16a34a; color: #fff; border-radius: ${borders.radius.lg};
  font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;
  box-shadow: ${shadows.lg}; opacity: ${p => p.$v ? 1 : 0}; transform: translateY(${p => p.$v ? 0 : -10}px);
  transition: all 0.3s; pointer-events: none;
`;

interface BrevoList { id: number; name: string; totalSubscribers?: number }

interface NewsletterConfig {
  enabled: boolean;
  sync_mode: 'realtime' | 'manual';
  brevo_api_key: string;
  brevo_list_id: string; // stored as string to keep <select> happy
  brevo_double_opt_in: boolean;
  brevo_redirect_url: string;
  brevo_template_id: string;
}

const DEFAULTS: NewsletterConfig = {
  enabled: true,
  sync_mode: 'realtime',
  brevo_api_key: '',
  brevo_list_id: '',
  brevo_double_opt_in: false,
  brevo_redirect_url: '',
  brevo_template_id: '',
};

export const NewsletterBrevoSettings = () => {
  const { locale } = useI18n();
  const toast = useToast();
  const [config, setConfig] = useState<NewsletterConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; account?: any; error?: string } | null>(null);
  const [lists, setLists] = useState<BrevoList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ total: number; synced: number; failed: number } | null>(null);
  const [subscriberStats, setSubscriberStats] = useState<{ total: number; synced: number; failed: number }>({ total: 0, synced: 0, failed: 0 });

  const t = (en: string, pt: string) => locale === 'pt' ? pt : en;

  const supabase = getSupabase();

  const loadConfig = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('addon_configs')
        .select('config')
        .eq('addon_id', 'newsletter')
        .maybeSingle();
      const cfg = (data?.config as Partial<NewsletterConfig>) || {};
      setConfig({
        ...DEFAULTS,
        ...cfg,
        brevo_list_id: cfg.brevo_list_id != null ? String(cfg.brevo_list_id) : '',
        brevo_template_id: cfg.brevo_template_id != null ? String(cfg.brevo_template_id) : '',
      });
    } catch {
      // No config row yet — use defaults
    }
  }, [supabase]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.getEntries('newsletter-subscribers');
      const subs = data || [];
      let synced = 0, failed = 0;
      subs.forEach((s: any) => {
        const c = s.content || {};
        if (c.synced_to_brevo) synced++;
        else if (c.sync_error) failed++;
      });
      setSubscriberStats({ total: subs.length, synced, failed });
    } catch {
      // newsletter-subscribers collection may not exist yet
    }
  }, []);

  useEffect(() => {
    Promise.all([loadConfig(), loadStats()]).finally(() => setLoading(false));
  }, [loadConfig, loadStats]);

  // Auto-load Brevo lists when API key is present and looks valid
  useEffect(() => {
    if (config.brevo_api_key && config.brevo_api_key.length > 20) {
      handleLoadLists(config.brevo_api_key, false);
    } else {
      setLists([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.brevo_api_key]);

  const update = <K extends keyof NewsletterConfig>(key: K, value: NewsletterConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    if (!config.brevo_api_key) {
      toast.error(t('Enter your Brevo API key first', 'Insira primeiro a sua API key da Brevo'));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await api.brevoTestConnection(config.brevo_api_key);
      if (error || !data) {
        setTestResult({ ok: false, error: error || 'Unknown error' });
      } else {
        setTestResult({ ok: true, account: data });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleLoadLists = async (apiKey: string, showFeedback = true) => {
    setLoadingLists(true);
    try {
      const { data, error } = await api.brevoListLists(apiKey);
      if (error) {
        if (showFeedback) toast.error('Failed to load lists: ' + error);
        setLists([]);
      } else {
        setLists(data || []);
      }
    } finally {
      setLoadingLists(false);
    }
  };

  const handleSave = async () => {
    if (!supabase) {
      toast.error(t('Supabase not initialised', 'Supabase não inicializado'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        addon_id: 'newsletter',
        config: {
          ...config,
          brevo_list_id: config.brevo_list_id ? Number(config.brevo_list_id) : '',
          brevo_template_id: config.brevo_template_id ? Number(config.brevo_template_id) : '',
        },
      };
      const { error } = await supabase
        .from('addon_configs')
        .upsert(payload, { onConflict: 'addon_id' });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAll = async () => {
    if (!config.brevo_api_key) {
      toast.error(t('Save your Brevo configuration first', 'Guarde primeiro a configuração da Brevo'));
      return;
    }
    if (!confirm(t(
      'This will push every existing subscriber to Brevo. It can take a few minutes for large lists. Continue?',
      'Isto vai enviar todos os subscritores actuais para a Brevo. Pode demorar minutos em listas grandes. Continuar?'
    ))) return;

    setSyncing(true);
    try {
      const { data, error } = await api.brevoSyncAll();
      if (error) {
        toast.error('Sync failed: ' + error);
      } else if (data) {
        setLastSync({ total: data.total, synced: data.synced, failed: data.failed });
        await loadStats();
        if (data.failed === 0) {
          toast.success(t(
            `Synced ${data.synced} subscribers`,
            `Sincronizados ${data.synced} subscritores`
          ));
        } else {
          toast.error(t(
            `Synced ${data.synced} / ${data.total}, ${data.failed} failed`,
            `Sincronizados ${data.synced} / ${data.total}, ${data.failed} falharam`
          ));
        }
      }
    } finally {
      setSyncing(false);
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

  return (
    <Container>
      <Toast $v={saved}><CheckCircle size={16} /> {t('Settings saved', 'Definições guardadas')}</Toast>

      <Header>
        <div>
          <h1><Mail size={28} color="#2563eb" /> {t('Newsletter Configuration', 'Configuração da Newsletter')}</h1>
          <p>{t(
            'Subscribers are stored in the CMS and pushed to Brevo where you create and send campaigns. Brevo handles delivery, templates, and analytics — kibanCMS handles capture.',
            'Os subscritores ficam guardados no CMS e são enviados para a Brevo, onde criar e envia as campanhas. A Brevo trata da entrega, templates e analytics — o kibanCMS trata da captura.'
          )}</p>
        </div>
        <SaveBtn onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> {t('Saving...', 'A guardar...')}</> : <><Save size={18} /> {t('Save', 'Guardar')}</>}
        </SaveBtn>
      </Header>

      {/* Info */}
      <InfoCard $variant="info">
        <Plug size={18} />
        <div>
          <strong>{t('What is Brevo?', 'O que é a Brevo?')}</strong>
          {t(
            'Brevo (formerly Sendinblue) is a professional email marketing platform. The free tier allows 300 emails/day with no credit card. ',
            'A Brevo (antiga Sendinblue) é uma plataforma profissional de email marketing. O tier gratuito permite 300 emails/dia sem cartão de crédito. '
          )}
          <a href="https://www.brevo.com/free-shop/?tap_a=30591-fb13f0&tap_s=2" target="_blank" rel="noopener">
            {t('Create a free account', 'Criar conta gratuita')} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} />
          </a>
        </div>
      </InfoCard>

      {/* Status / Stats */}
      <Section>
        <h2><UsersIcon size={18} /> {t('Subscriber Status', 'Estado dos Subscritores')}</h2>
        <StatsGrid>
          <Stat>
            <div className="stat-label">{t('Total', 'Total')}</div>
            <div className="stat-value">{subscriberStats.total}</div>
          </Stat>
          <Stat $variant={subscriberStats.synced > 0 ? 'success' : 'neutral'}>
            <div className="stat-label">{t('Synced to Brevo', 'Sincronizados na Brevo')}</div>
            <div className="stat-value">{subscriberStats.synced}</div>
          </Stat>
          <Stat $variant={subscriberStats.failed > 0 ? 'error' : 'neutral'}>
            <div className="stat-label">{t('Failed', 'Com erro')}</div>
            <div className="stat-value">{subscriberStats.failed}</div>
          </Stat>
        </StatsGrid>

        {(subscriberStats.total > subscriberStats.synced || subscriberStats.failed > 0) && (
          <div style={{ marginTop: spacing[4] }}>
            <SecondaryBtn onClick={handleSyncAll} disabled={syncing || !config.brevo_api_key}>
              {syncing
                ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('Syncing...', 'A sincronizar...')}</>
                : <><RefreshCw /> {t('Re-sync all subscribers to Brevo', 'Re-sincronizar todos os subscritores para a Brevo')}</>
              }
            </SecondaryBtn>
            {lastSync && (
              <p style={{ fontSize: 12, color: colors.gray[500], marginTop: spacing[2], margin: `${spacing[2]} 0 0` }}>
                {t('Last sync:', 'Última sincronização:')} {lastSync.synced} / {lastSync.total} OK · {lastSync.failed} {t('errors', 'erros')}
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Brevo Connection */}
      <Section>
        <h2><Plug size={18} /> {t('Brevo Connection', 'Ligação à Brevo')}</h2>

        <Grid>
          <Field $full>
            <label>{t('Brevo API Key', 'Chave API Brevo')} *</label>
            <div className="row">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.brevo_api_key}
                onChange={e => update('brevo_api_key', e.target.value.trim())}
                placeholder="xkeysib-..."
                autoComplete="off"
              />
              <SecondaryBtn type="button" onClick={() => setShowKey(s => !s)}>
                {showKey ? <EyeOff /> : <Eye />}
              </SecondaryBtn>
              <SecondaryBtn type="button" onClick={handleTest} disabled={testing || !config.brevo_api_key}>
                {testing
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('Testing...', 'A testar...')}</>
                  : <><Zap /> {t('Test', 'Testar')}</>
                }
              </SecondaryBtn>
            </div>
            <p className="help">
              {t('Find your API key in ', 'Encontra a chave API em ')}
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener">
                Brevo → Settings → SMTP & API <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'text-bottom' }} />
              </a>
            </p>
          </Field>

          {testResult && (
            <Field $full>
              <InfoCard $variant={testResult.ok ? 'success' : 'warning'} style={{ margin: 0 }}>
                {testResult.ok ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                <div>
                  {testResult.ok ? (
                    <>
                      <strong>{t('Connection successful', 'Ligação bem-sucedida')}</strong>
                      {t('Account: ', 'Conta: ')}{testResult.account.email}
                      {testResult.account.firstName && ` (${testResult.account.firstName} ${testResult.account.lastName || ''})`}
                    </>
                  ) : (
                    <>
                      <strong>{t('Connection failed', 'Ligação falhada')}</strong>
                      {testResult.error}
                    </>
                  )}
                </div>
              </InfoCard>
            </Field>
          )}

          <Field $full>
            <label>{t('Contact List', 'Lista de Contactos')}</label>
            <div className="row">
              <select
                value={config.brevo_list_id}
                onChange={e => update('brevo_list_id', e.target.value)}
                disabled={!config.brevo_api_key || lists.length === 0}
              >
                <option value="">{t('— Select a list —', '— Seleccionar lista —')}</option>
                {lists.map(l => (
                  <option key={l.id} value={String(l.id)}>
                    {l.name} (#{l.id}{typeof l.totalSubscribers === 'number' ? ` · ${l.totalSubscribers} subs` : ''})
                  </option>
                ))}
              </select>
              <SecondaryBtn
                type="button"
                onClick={() => handleLoadLists(config.brevo_api_key, true)}
                disabled={loadingLists || !config.brevo_api_key}
              >
                {loadingLists
                  ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <RefreshCw />
                }
              </SecondaryBtn>
            </div>
            <p className="help">{t(
              'Subscribers are added to this list. Create lists in Brevo → Contacts → Lists.',
              'Os subscritores são adicionados a esta lista. Cria listas em Brevo → Contactos → Listas.'
            )}</p>
          </Field>

          <Field>
            <label>{t('Sync Mode', 'Modo de Sincronização')}</label>
            <select value={config.sync_mode} onChange={e => update('sync_mode', e.target.value as any)}>
              <option value="realtime">{t('Realtime — push on each subscribe', 'Tempo real — envia em cada subscrição')}</option>
              <option value="manual">{t('Manual — only via "Sync all" button', 'Manual — apenas via botão "Sincronizar tudo"')}</option>
            </select>
            <p className="help">{t(
              'Realtime is recommended. Manual is useful for staging/testing.',
              'Tempo real é o recomendado. Manual é útil para staging/testes.'
            )}</p>
          </Field>

          <Field>
            <label>&nbsp;</label>
            <div className="check-row">
              <input
                type="checkbox"
                id="brevo-doi"
                checked={config.brevo_double_opt_in}
                onChange={e => update('brevo_double_opt_in', e.target.checked)}
              />
              <label htmlFor="brevo-doi" style={{ margin: 0 }}>
                {t('Double opt-in (advanced)', 'Double opt-in (avançado)')}
              </label>
            </div>
            <p className="help">{t(
              'Requires Brevo template + redirect URL. Leave off unless legally required.',
              'Requer template Brevo + URL de redirecção. Deixa desligado salvo obrigação legal.'
            )}</p>
          </Field>
        </Grid>
      </Section>

      {/* Where do campaigns happen? */}
      <InfoCard $variant="info">
        <Mail size={18} />
        <div>
          <strong>{t('Where do I create campaigns?', 'Onde crio campanhas?')}</strong>
          {t(
            'Campaigns, templates, and scheduling all live in Brevo. Open ',
            'Campanhas, templates e agendamento ficam todos na Brevo. Abre '
          )}
          <a href="https://app.brevo.com/camp/lists" target="_blank" rel="noopener">
            Brevo → Campaigns <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} />
          </a>
          {t(
            ' — kibanCMS only handles subscriber capture and audit.',
            ' — o kibanCMS só faz captura e auditoria dos subscritores.'
          )}
        </div>
      </InfoCard>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};
