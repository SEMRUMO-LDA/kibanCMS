/**
 * Settings → Health
 *
 * One checklist per tenant: is this client's CMS fully working? Every red or
 * amber line says exactly what to do. Text lives here (PT/EN); the API only
 * returns check ids, statuses and facts.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Loader2 } from 'lucide-react';
import { colors, spacing, typography } from '../../shared/styles/design-tokens';
import { api } from '../../lib/api';
import { Panel, PanelHeader, Button, Banner, TONE, type Tone } from './panel-styles';

type Check = { id: string; status: Tone; facts: Record<string, any> };

interface Props {
  locale: 'pt' | 'en';
  /** Switch to another Settings tab (e.g. "email", "api"). */
  onNavigateTab?: (tab: string) => void;
}

interface Described {
  title: string;
  message: string;
  action?: string;
  tab?: string;
  tabLabel?: string;
}

const FEATURE_NAMES: Record<string, { pt: string; en: string }> = {
  schema_status: { pt: 'Verificação de versão', en: 'Version check' },
  snapshots: { pt: 'Snapshots', en: 'Snapshots' },
  coupon_limits: { pt: 'Limites de cupões', en: 'Coupon limits' },
  trash: { pt: 'Lixeira', en: 'Trash' },
  addons: { pt: 'Add-ons', en: 'Add-ons' },
  channel_manager: { pt: 'Channel Manager', en: 'Channel Manager' },
  api_key_rpc: { pt: 'Botão "Gerar API key"', en: '"Generate API key" button' },
  role_protection: { pt: 'Proteção de papéis', en: 'Role protection' },
  cookie_consents: { pt: 'Registo de consentimentos de cookies', en: 'Cookie consent log' },
  media_bucket: { pt: 'Bucket de imagens', en: 'Image bucket' },
  translation_cache: { pt: 'Cache de traduções', en: 'Translation cache' },
  private_rls: { pt: 'Proteção de coleções privadas', en: 'Private collection protection' },
  author_set_null: { pt: 'Conteúdo sobrevive à remoção de utilizadores', en: 'Content survives user deletion' },
  live_slug_index: { pt: 'Slugs reutilizáveis após a Lixeira', en: 'Slug reuse after Trash' },
};

function fmtDate(iso: string | null | undefined, pt: boolean): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(pt ? 'pt-PT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function describeCheck(c: Check, locale: 'pt' | 'en'): Described {
  const pt = locale === 'pt';
  const f = c.facts || {};
  const L = (p: string, e: string) => (pt ? p : e);

  if (f.checkFailed) {
    return {
      title: c.id,
      message: L(`Não foi possível verificar: ${f.message}`, `Could not check: ${f.message}`),
    };
  }

  switch (c.id) {
    case 'database': {
      const title = L('Base de dados', 'Database');
      if (c.status === 'ok') return { title, message: L(`Atualizada (versão ${f.version}).`, `Up to date (version ${f.version}).`) };
      const missing = (f.missing as string[] || []).map(m => FEATURE_NAMES[m]?.[locale] || m).join(', ');
      return {
        title,
        message: L(
          `Desatualizada (versão ${f.version || '?'} de ${f.expected}). Em falta: ${missing}.`,
          `Out of date (version ${f.version || '?'} of ${f.expected}). Missing: ${missing}.`,
        ),
        action: L(
          'Abre a Supabase deste cliente → SQL Editor → cola database/UPGRADE_TENANT.sql → Run. É seguro correr mais do que uma vez.',
          "Open this client's Supabase → SQL Editor → paste database/UPGRADE_TENANT.sql → Run. Safe to run more than once.",
        ),
      };
    }

    case 'email_provider': {
      const title = L('Envio de emails', 'Email sending');
      if (c.status === 'ok') return { title, message: L(`Ativo. Remetente: ${f.fromEmail}.`, `Active. Sender: ${f.fromEmail}.`) };
      return {
        title,
        message: L(
          'Nenhum email está a ser enviado (formulários, reservas, encomendas): falta a RESEND_API_KEY no servidor.',
          'No emails are being sent (forms, bookings, orders): RESEND_API_KEY is missing on the server.',
        ),
        action: L('Railway → serviço da API → Variables → adiciona RESEND_API_KEY.', 'Railway → API service → Variables → add RESEND_API_KEY.'),
      };
    }

    case 'email_recipients': {
      const title = L('Quem recebe as notificações', 'Who gets notifications');
      const list = (f.recipients as string[] || []).join(', ');
      const goEmail = { tab: 'email', tabLabel: L('Abrir separador Email', 'Open Email tab') };
      if (c.status === 'ok') {
        return { title, message: L(`Formulários e reservas notificados para: ${list}.`, `Forms and bookings are sent to: ${list}.`) };
      }
      if (c.status === 'warn') {
        return {
          title,
          message: L(
            `Este cliente não tem destinatário próprio: as notificações vão para o email geral da agência (${list}).`,
            `This client has no recipient of its own: notifications go to the agency-wide address (${list}).`,
          ),
          action: L('Preenche "Notification Email(s)" no separador Email.', 'Fill in "Notification Email(s)" in the Email tab.'),
          ...goEmail,
        };
      }
      return {
        title,
        message: L('Ninguém recebe as notificações de formulários e reservas.', 'Nobody receives form and booking notifications.'),
        action: L('Preenche "Notification Email(s)" no separador Email.', 'Fill in "Notification Email(s)" in the Email tab.'),
        ...goEmail,
      };
    }

    case 'api_key_usage': {
      const title = L('Ligação do site', 'Site connection');
      const goApi = { tab: 'api', tabLabel: L('Ligar o meu site', 'Connect my site') };
      const last = fmtDate(f.lastUsedAt, pt);
      if (c.status === 'ok') return { title, message: L(`O site está a usar a API (último pedido: ${last}).`, `The site is using the API (last request: ${last}).`) };
      if (f.activeKeys === 0) {
        return {
          title,
          message: L('Não existe nenhuma API key: o site não consegue ler conteúdo.', 'There is no API key: the site cannot read content.'),
          action: L('Gera uma key e copia as variáveis para a Vercel.', 'Generate a key and copy the variables to Vercel.'),
          ...goApi,
        };
      }
      if (!f.lastUsedAt) {
        return {
          title,
          message: L('Existe uma API key, mas o site ainda não fez nenhum pedido com ela.', 'An API key exists but the site has never used it.'),
          action: L('Confirma as variáveis na Vercel e faz redeploy. Usa "Testar ligação" para validar a key.', 'Check the Vercel variables and redeploy. Use "Test connection" to validate the key.'),
          ...goApi,
        };
      }
      return {
        title,
        message: L(
          `O site não chama a API há mais de ${f.staleAfterDays} dias (último pedido: ${last}).`,
          `The site hasn't called the API for over ${f.staleAfterDays} days (last request: ${last}).`,
        ),
        action: L('Confirma se o site está online e se usa a key certa.', 'Check the site is online and uses the right key.'),
        ...goApi,
      };
    }

    case 'media_bucket': {
      const title = L('Imagens', 'Images');
      if (c.status === 'ok') return { title, message: L('Armazenamento de imagens pronto.', 'Image storage ready.') };
      if (c.status === 'warn') {
        return {
          title,
          message: L('O bucket "media" não é público: as imagens não aparecem no site.', 'The "media" bucket is not public: images will not show on the site.'),
          action: L('Supabase → Storage → media → Make public.', 'Supabase → Storage → media → Make public.'),
        };
      }
      return {
        title,
        message: L('Falta o bucket "media": os uploads de imagens falham.', 'The "media" bucket is missing: image uploads fail.'),
        action: L('Corre database/UPGRADE_TENANT.sql na Supabase deste cliente.', "Run database/UPGRADE_TENANT.sql on this client's Supabase."),
      };
    }

    case 'stripe': {
      const title = L('Pagamentos (Stripe)', 'Payments (Stripe)');
      if (!f.configured && c.status === 'info') {
        return { title, message: L('Não configurados. Só são precisos se o cliente vende online.', 'Not configured. Only needed if the client sells online.') };
      }
      const last = fmtDate(f.lastPaymentAt, pt) || L('ainda nenhum', 'none yet');
      if (c.status === 'ok') return { title, message: L(`Ativos. Último pagamento: ${last}.`, `Active. Last payment: ${last}.`) };
      return {
        title,
        message: f.configured
          ? L('Falta o webhook secret: os pagamentos são cobrados mas as encomendas e reservas não ficam confirmadas.', 'Webhook secret missing: payments are charged but orders and bookings are not confirmed.')
          : L('A configuração da Stripe existe mas não tem a secret key.', 'Stripe config exists but has no secret key.'),
        action: L(
          'Stripe → Developers → Webhooks → endpoint https://<domínio>/api/v1/payments/webhook → copia o signing secret para a configuração da Stripe no CMS.',
          'Stripe → Developers → Webhooks → endpoint https://<domain>/api/v1/payments/webhook → copy the signing secret into the CMS Stripe config.',
        ),
      };
    }

    case 'forms': {
      const title = L('Formulários', 'Forms');
      if (!f.installed) return { title, message: L('Add-on Forms não instalado.', 'Forms add-on not installed.') };
      const last = fmtDate(f.lastSubmissionAt, pt) || L('ainda nenhum', 'none yet');
      const message = L(`Último formulário recebido: ${last}.`, `Last form received: ${last}.`);
      const disabled = (f.disabled as string[]) || [];
      const drafts = (f.drafts as string[]) || [];
      const unmatched = (f.unmatched as string[]) || [];
      if (disabled.length || drafts.length || unmatched.length) {
        const parts: string[] = [];
        if (unmatched.length) parts.push(L(
          `O site envia formulários sem configuração correspondente: ${unmatched.map(n => `"${n}"`).join(', ')}. Usam os emails de Settings → Email (Notification Email(s) / Contact Email); se estiverem vazios, não sai email.`,
          `The site sends forms with no matching config: ${unmatched.map(n => `"${n}"`).join(', ')}. They use the Settings → Email recipients; if empty, no email is sent.`,
        ));
        if (disabled.length) parts.push(L(
          `Notificações desligadas ("Active" desmarcado) em: ${disabled.join(', ')} — estes formulários não enviam email nem webhook.`,
          `Notifications off ("Active" unticked) for: ${disabled.join(', ')} — these forms send no email or webhook.`,
        ));
        if (drafts.length) parts.push(L(
          `Configuração em rascunho (ignorada) em: ${drafts.join(', ')}.`,
          `Config left as draft (ignored) for: ${drafts.join(', ')}.`,
        ));
        return {
          title,
          message: `${message} ${parts.join(' ')}`,
          action: L(
            'Conteúdo → Forms Config: o campo form_name tem de ser igual ao nome que o site envia; marca "Active" e publica.',
            'Content → Forms Config: form_name must match the name the site sends; tick "Active" and publish.',
          ),
        };
      }
      return { title, message };
    }

    case 'meta_capi': {
      const title = L('Meta Pixel e Conversions API', 'Meta Pixel & Conversions API');
      if (f.pixelBlocked) return {
        title,
        message: !f.cookieBanner
          ? L('O Pixel está configurado mas o banner de cookies está desligado: sem consentimento de marketing, o Pixel nunca carrega.',
              'The Pixel is set up but the cookie banner is off: without marketing consent the Pixel never loads.')
          : L('O Pixel está configurado mas o banner de cookies não mostra a categoria Marketing: ninguém pode dar consentimento, por isso o Pixel nunca carrega.',
              'The Pixel is set up but the cookie banner has no Marketing category: nobody can consent, so the Pixel never loads.'),
        action: L('Add-ons → Cookie Notice: ativa o banner e a categoria "Marketing".', 'Add-ons → Cookie Notice: enable the banner and the "Marketing" category.'),
      };
      const pixelLine = f.pixelId
        ? (f.pixelAutoload
            ? L(`Pixel ${f.pixelId} instalado pelo Kiban após consentimento de marketing.`, `Pixel ${f.pixelId} installed by Kiban after marketing consent.`)
            : L(`Pixel ${f.pixelId} (instalado pelo próprio site).`, `Pixel ${f.pixelId} (installed by the site).`))
        : L('Sem Pixel ID.', 'No Pixel ID.');
      if (!f.enabled) return { title, message: `${pixelLine} ${L('Conversions API desligada (Conteúdo → SEO Settings).', 'Conversions API off (Content → SEO Settings).')}` };
      if (!f.configured) return {
        title,
        message: L('Ligada, mas falta o Pixel ID ou o token de acesso — nenhum evento é enviado.', 'On, but the Pixel ID or access token is missing — no events are sent.'),
        action: L('Conteúdo → SEO Settings → Facebook Pixel ID e CAPI Access Token.', 'Content → SEO Settings → Facebook Pixel ID and CAPI Access Token.'),
      };
      const consent = f.consentMode === 'always'
        ? L('envia sempre (base legal do cliente)', 'always sends (client legal basis)')
        : L('só com consentimento de marketing', 'only with marketing consent');
      const last = fmtDate(f.lastSentAt, pt) || L('ainda nenhum desde o último arranque', 'none since the last restart');
      const base = L(
        `Ativa, ${consent}. Último evento: ${last}${f.lastEvent ? ` (${f.lastEvent})` : ''}. Enviados: ${f.sent}; sem consentimento (não enviados): ${f.skippedNoConsent}.${f.testMode ? ' Modo de teste ligado.' : ''}`,
        `On, ${consent}. Last event: ${last}${f.lastEvent ? ` (${f.lastEvent})` : ''}. Sent: ${f.sent}; without consent (not sent): ${f.skippedNoConsent}.${f.testMode ? ' Test mode on.' : ''}`,
      );
      if (c.status === 'error') return {
        title,
        message: `${pixelLine} ${base} ${L('Último erro', 'Last error')}: ${f.lastError}`,
        action: L('Confirma o token e o Pixel ID; o token pode ter expirado.', 'Check the token and Pixel ID; the token may have expired.'),
      };
      return { title, message: `${pixelLine} ${base}` };
    }

    case 'domain': {
      const title = L('Endereço da API', 'API address');
      const origins = (f.origins as string[] || []).join(', ');
      const base = L(
        `Os sites chamam ${f.apiUrl} com o cabeçalho X-Tenant: ${f.tenantId}.${origins ? ` Sites autorizados no browser: ${origins}.` : ''}`,
        `Sites call ${f.apiUrl} with the header X-Tenant: ${f.tenantId}.${origins ? ` Browser origins allowed: ${origins}.` : ''}`,
      );
      const missing = (f.dnsMissing as string[] || []);
      if (missing.length) {
        return {
          title,
          message: base,
          action: L(
            `O domínio ${missing.join(', ')} está configurado em TENANTS mas não existe no DNS. Até criares o registo (CNAME para a Railway + custom domain), usa ${f.apiUrl} com X-Tenant.`,
            `${missing.join(', ')} is configured in TENANTS but has no DNS record. Until you add it (CNAME to Railway + custom domain), use ${f.apiUrl} with X-Tenant.`,
          ),
        };
      }
      return { title, message: base };
    }

    default:
      return { title: c.id, message: '' };
  }
}

const ORDER: Record<Tone, number> = { error: 0, warn: 1, ok: 2, info: 3 };

const List = styled.ul`
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: ${spacing[2]};
`;

const Item = styled.li<{ $tone: Tone }>`
  display: grid; grid-template-columns: 22px 1fr; gap: ${spacing[3]};
  padding: ${spacing[4]};
  border: 1px solid ${p => (p.$tone === 'ok' || p.$tone === 'info' ? colors.gray[200] : TONE[p.$tone].border)};
  background: ${p => (p.$tone === 'ok' || p.$tone === 'info' ? colors.white : TONE[p.$tone].bg)};
  border-radius: 12px;
  .icon svg { width: 20px; height: 20px; color: ${p => TONE[p.$tone].fg}; }
  .title { font-size: ${typography.fontSize.sm}; font-weight: 600; color: ${colors.gray[800]}; }
  .msg { font-size: ${typography.fontSize.sm}; color: ${colors.gray[700]}; margin-top: 2px; line-height: 1.5; word-break: break-word; }
  .action { font-size: 13px; color: ${p => TONE[p.$tone].fg}; margin-top: ${spacing[2]}; line-height: 1.5; }
  .action button {
    margin-left: ${spacing[2]}; background: none; border: none; padding: 0;
    color: ${colors.accent[700]}; font-weight: 600; cursor: pointer; text-decoration: underline;
    font-size: inherit; font-family: inherit;
  }
`;

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'ok') return <CheckCircle2 aria-hidden />;
  if (tone === 'warn') return <AlertTriangle aria-hidden />;
  if (tone === 'error') return <XCircle aria-hidden />;
  return <Info aria-hidden />;
}

export function SiteHealthPanel({ locale, onNavigateTab }: Props) {
  const pt = locale === 'pt';
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [summary, setSummary] = useState<{ error: number; warn: number; ok: number } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await api.getSiteHealth();
    if (err || !data) {
      setError(err || 'Unknown error');
    } else {
      setChecks([...data.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) as Check[]);
      setSummary(data.summary);
      setCheckedAt(data.checkedAt);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const overall: Tone = !summary ? 'info' : summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';
  const overallText = !summary ? '' : overall === 'ok'
    ? (pt ? 'Está tudo a funcionar.' : 'Everything is working.')
    : pt
      ? `${summary.error} problema(s) a resolver e ${summary.warn} aviso(s).`
      : `${summary.error} problem(s) to fix and ${summary.warn} warning(s).`;

  return (
    <Panel>
      <PanelHeader>
        <div>
          <h2>{pt ? 'Saúde deste cliente' : 'Health of this client'}</h2>
          <p>
            {pt
              ? 'Verifica se a base de dados, os emails, a ligação do site e os pagamentos estão a funcionar.'
              : 'Checks that the database, emails, site connection and payments are working.'}
          </p>
        </div>
        <Button $variant="secondary" onClick={load} disabled={loading}>
          {loading ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw />}
          {pt ? 'Verificar de novo' : 'Check again'}
        </Button>
      </PanelHeader>

      {error && (
        <Banner $tone="error" role="alert" style={{ marginBottom: spacing[4] }}>
          <XCircle aria-hidden />
          <span>{pt ? `Não foi possível obter o estado: ${error}` : `Could not load the status: ${error}`}</span>
        </Banner>
      )}

      {summary && (
        <Banner $tone={overall} style={{ marginBottom: spacing[4] }} aria-live="polite">
          <ToneIcon tone={overall} />
          <span>
            <strong>{overallText}</strong>
            {checkedAt && (
              <span style={{ opacity: 0.8 }}>
                {' '}· {pt ? 'verificado às' : 'checked at'} {new Date(checkedAt).toLocaleTimeString(pt ? 'pt-PT' : 'en-GB', { timeStyle: 'short' })}
              </span>
            )}
          </span>
        </Banner>
      )}

      {!checks && !error && (
        <p style={{ color: colors.gray[500], fontSize: typography.fontSize.sm }}>
          {pt ? 'A verificar…' : 'Checking…'}
        </p>
      )}

      {checks && (
        <List>
          {checks.map(c => {
            const d = describeCheck(c, locale);
            return (
              <Item key={c.id} $tone={c.status}>
                <span className="icon"><ToneIcon tone={c.status} /></span>
                <div>
                  <div className="title">{d.title}</div>
                  <div className="msg">{d.message}</div>
                  {(d.action || d.tab) && (
                    <div className="action">
                      {d.action}
                      {d.tab && onNavigateTab && (
                        <button type="button" onClick={() => onNavigateTab(d.tab!)}>{d.tabLabel}</button>
                      )}
                    </div>
                  )}
                </div>
              </Item>
            );
          })}
        </List>
      )}
    </Panel>
  );
}
