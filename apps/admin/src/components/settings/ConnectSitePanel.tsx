/**
 * Settings → API → "Ligar o meu site"
 *
 * Takes a frontend developer from zero to a working connection:
 *   1. get a key (generate one, or paste an existing one)
 *   2. copy a ready-to-paste env block for Vercel, with THIS client's API URL
 *   3. test the key against this client's API
 *   4. copy a server-side fetch example
 */

import { useEffect, useMemo, useState } from 'react';
import { Plug, KeyRound, Copy, Check, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { spacing } from '../../shared/styles/design-tokens';
import { api } from '../../lib/api';
import { supabase, getTenantId } from '../../lib/supabase';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { Panel, PanelHeader, Button, Banner, CodeBlock, Step, Row } from './panel-styles';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/v1';
const KEY_PATTERN = /^kiban_live_[A-Za-z0-9]{20,}$/;

interface Props {
  locale: 'pt' | 'en';
  /** Called after a new key is created so the key list can refresh. */
  onKeyCreated?: () => void;
}

type TestResult =
  | { ok: true; total: number; collection: string }
  | { ok: false; message: string };

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(c => (c === id ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the text is still visible to copy by hand */
    }
  };
  return { copied, copy };
}

export function ConnectSitePanel({ locale, onKeyCreated }: Props) {
  const pt = locale === 'pt';
  const L = (p: string, e: string) => (pt ? p : e);
  const { user } = useAuth();
  const { copied, copy } = useCopy();

  const [info, setInfo] = useState<{ apiUrl: string; collections: Array<{ slug: string; name: string }> } | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [keyIsNew, setKeyIsNew] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [testCollection, setTestCollection] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    api.getSiteConnection().then(({ data, error }) => {
      if (error || !data) { setInfoError(error || 'Unknown error'); return; }
      setInfo(data);
      const preferred = data.collections.find(c => c.slug !== 'site-settings') || data.collections[0];
      if (preferred) setTestCollection(preferred.slug);
    });
  }, []);

  const keyLooksValid = KEY_PATTERN.test(key.trim());
  const apiUrl = info?.apiUrl || 'https://<dominio-do-cliente>';
  const shownKey = keyLooksValid ? key.trim() : 'kiban_live_…';

  const envBlock = `NEXT_PUBLIC_KIBAN_API_URL=${apiUrl}\nKIBAN_API_KEY=${shownKey}`;

  const exampleSlug = testCollection || 'blog';
  const snippet = useMemo(() => `// app/${exampleSlug}/page.tsx — Server Component (the key never reaches the browser)
async function getEntries() {
  const res = await fetch(
    \`\${process.env.NEXT_PUBLIC_KIBAN_API_URL}/api/v1/entries/${exampleSlug}\`,
    {
      headers: { Authorization: \`Bearer \${process.env.KIBAN_API_KEY}\` },
      next: { revalidate: 60 },
    },
  );
  if (!res.ok) throw new Error(\`Kiban API \${res.status}\`);
  const { data } = await res.json();
  return data; // only published entries
}`, [exampleSlug]);

  const generateKey = async () => {
    if (!user?.id) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { data, error } = await supabase.rpc('generate_new_api_key_for_user' as any, {
        user_profile_id: user.id,
        key_name: L('Site (Vercel)', 'Website (Vercel)'),
      } as any);
      if (error) throw error;
      // RPC isn't in the generated Supabase types — type the row explicitly.
      const rows = data as unknown as { api_key?: string } | Array<{ api_key?: string }> | null;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.api_key) throw new Error(L('A função não devolveu nenhuma key.', 'The function returned no key.'));
      setKey(row.api_key);
      setKeyIsNew(true);
      setTestResult(null);
      onKeyCreated?.();
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      const hint = /could not find the function|does not exist/i.test(msg)
        ? L(' — corre database/UPGRADE_TENANT.sql na Supabase deste cliente.', " — run database/UPGRADE_TENANT.sql on this client's Supabase.")
        : '';
      setGenError(msg + hint);
    } finally {
      setGenerating(false);
    }
  };

  const testConnection = async () => {
    if (!keyLooksValid || !testCollection) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Same request the site will make, sent to this client's API.
      const headers: Record<string, string> = { Authorization: `Bearer ${key.trim()}` };
      const tenantId = getTenantId();
      if (tenantId) headers['X-Tenant'] = tenantId;
      const res = await fetch(`${API_BASE}/entries/${encodeURIComponent(testCollection)}?limit=1`, { headers });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({ ok: true, total: json?.meta?.pagination?.total ?? (json?.data?.length || 0), collection: testCollection });
      } else if (res.status === 401) {
        setTestResult({ ok: false, message: L(
          'Key inválida ou revogada para este cliente. Confirma que foi gerada neste painel (cada cliente tem as suas keys).',
          'Invalid or revoked key for this client. Make sure it was generated in this panel (each client has its own keys).',
        ) });
      } else {
        setTestResult({ ok: false, message: json?.error?.message || `HTTP ${res.status}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <div>
          <h2><Plug style={{ width: 18, height: 18, verticalAlign: '-3px', marginRight: 6 }} aria-hidden />{L('Ligar o meu site', 'Connect my site')}</h2>
          <p>{L(
            'Tudo o que o site (Next.js na Vercel) precisa para mostrar o conteúdo deste cliente.',
            "Everything the website (Next.js on Vercel) needs to show this client's content.",
          )}</p>
        </div>
      </PanelHeader>

      {infoError && (
        <Banner $tone="error" role="alert" style={{ marginBottom: spacing[4] }}>
          <XCircle aria-hidden /><span>{infoError}</span>
        </Banner>
      )}

      {/* 1 — key */}
      <Step>
        <div className={`num ${keyLooksValid ? 'done' : ''}`}>1</div>
        <div>
          <h3>{L('API key do site', 'Site API key')}</h3>
          <p>{L(
            'Gera uma key nova para este site, ou cola uma que já tenhas criado neste cliente.',
            'Generate a new key for this site, or paste one you already created for this client.',
          )}</p>
          <Row>
            <Button onClick={generateKey} disabled={generating || !user?.id}>
              {generating ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound />}
              {L('Gerar key para o site', 'Generate site key')}
            </Button>
            <input
              type="text"
              value={key}
              onChange={e => { setKey(e.target.value); setKeyIsNew(false); setTestResult(null); }}
              placeholder={L('ou cola aqui: kiban_live_…', 'or paste here: kiban_live_…')}
              aria-label={L('API key', 'API key')}
              spellCheck={false}
              autoComplete="off"
            />
          </Row>
          {genError && (
            <Banner $tone="error" role="alert"><XCircle aria-hidden /><span>{genError}</span></Banner>
          )}
          {keyIsNew && (
            <Banner $tone="warn">
              <AlertTriangle aria-hidden />
              <span>{L(
                'Copia a key agora: por segurança, só é mostrada esta vez. Se a perderes, gera outra e revoga esta na lista abaixo.',
                "Copy the key now: for security it's only shown once. If you lose it, generate another and revoke this one below.",
              )}</span>
            </Banner>
          )}
          {key && !keyLooksValid && (
            <Banner $tone="warn"><AlertTriangle aria-hidden /><span>{L('Isto não parece uma key do Kiban (kiban_live_…).', "This doesn't look like a Kiban key (kiban_live_…).")}</span></Banner>
          )}
        </div>
      </Step>

      {/* 2 — env vars */}
      <Step>
        <div className="num">2</div>
        <div>
          <h3>{L('Variáveis para a Vercel', 'Variables for Vercel')}</h3>
          <div style={{ position: 'relative', marginBottom: spacing[3] }}>
            <CodeBlock aria-label={L('Variáveis de ambiente', 'Environment variables')}>{envBlock}</CodeBlock>
            <div style={{ marginTop: spacing[2] }}>
              <Button $variant="secondary" onClick={() => copy('env', envBlock)} disabled={!keyLooksValid}>
                {copied === 'env' ? <Check /> : <Copy />}
                {copied === 'env' ? L('Copiado', 'Copied') : L('Copiar variáveis', 'Copy variables')}
              </Button>
            </div>
          </div>
          <ol>
            <li>{L('Vercel → projeto do site → Settings → Environment Variables.', 'Vercel → site project → Settings → Environment Variables.')}</li>
            <li>{L('Cola as duas linhas (a Vercel aceita colar o bloco inteiro).', 'Paste both lines (Vercel accepts the whole block).')}</li>
            <li>{L('Marca Production, Preview e Development.', 'Tick Production, Preview and Development.')}</li>
            <li>{L('Deployments → ⋯ no último deploy → Redeploy (as variáveis só entram em deploys novos).', 'Deployments → ⋯ on the latest deploy → Redeploy (variables only apply to new deploys).')}</li>
          </ol>
          <p style={{ marginBottom: 0 }}>
            <strong>{L('Importante:', 'Important:')}</strong>{' '}
            {L(
              'a key nunca leva o prefixo NEXT_PUBLIC_ e só deve ser usada no servidor (Server Components, route handlers). No browser ficaria visível para qualquer pessoa.',
              'the key must never have the NEXT_PUBLIC_ prefix and must only be used on the server (Server Components, route handlers). In the browser anyone could read it.',
            )}
          </p>
        </div>
      </Step>

      {/* 3 — test */}
      <Step>
        <div className={`num ${testResult?.ok ? 'done' : ''}`}>3</div>
        <div>
          <h3>{L('Testar ligação', 'Test connection')}</h3>
          <p>{L(
            'Faz o mesmo pedido que o site vai fazer. Só são devolvidas entradas publicadas.',
            'Makes the same request the site will make. Only published entries are returned.',
          )}</p>
          <Row>
            <select
              value={testCollection}
              onChange={e => { setTestCollection(e.target.value); setTestResult(null); }}
              aria-label={L('Collection', 'Collection')}
              disabled={!info?.collections.length}
            >
              {(info?.collections || []).map(c => (
                <option key={c.slug} value={c.slug}>{c.name} ({c.slug})</option>
              ))}
            </select>
            <Button onClick={testConnection} disabled={!keyLooksValid || !testCollection || testing}>
              {testing ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Plug />}
              {L('Testar ligação', 'Test connection')}
            </Button>
          </Row>
          {info && info.collections.length === 0 && (
            <Banner $tone="info"><AlertTriangle aria-hidden /><span>{L('Ainda não há collections públicas. Cria uma em Conteúdo.', 'No public collections yet. Create one under Content.')}</span></Banner>
          )}
          {testResult?.ok && (
            <Banner $tone="ok" aria-live="polite">
              <CheckCircle2 aria-hidden />
              <span>{L(
                `Ligação a funcionar. "${testResult.collection}" tem ${testResult.total} entrada(s) publicada(s).${testResult.total === 0 ? ' Publica pelo menos uma para a ver no site.' : ''}`,
                `Connection working. "${testResult.collection}" has ${testResult.total} published entr${testResult.total === 1 ? 'y' : 'ies'}.${testResult.total === 0 ? ' Publish at least one to see it on the site.' : ''}`,
              )}</span>
            </Banner>
          )}
          {testResult && !testResult.ok && (
            <Banner $tone="error" role="alert"><XCircle aria-hidden /><span>{testResult.message}</span></Banner>
          )}
        </div>
      </Step>

      {/* 4 — example */}
      <Step>
        <div className="num">4</div>
        <div>
          <h3>{L('Exemplo de código (Next.js)', 'Code example (Next.js)')}</h3>
          <CodeBlock>{snippet}</CodeBlock>
          <div style={{ marginTop: spacing[2] }}>
            <Button $variant="secondary" onClick={() => copy('snippet', snippet)}>
              {copied === 'snippet' ? <Check /> : <Copy />}
              {copied === 'snippet' ? L('Copiado', 'Copied') : L('Copiar exemplo', 'Copy example')}
            </Button>
          </div>
        </div>
      </Step>
    </Panel>
  );
}
