/**
 * Internationalization Manager (v1.6+)
 *
 * Bulk-translate any collection's entries into a target language using the
 * tenant's DeepL API key. Results are stored in entries.meta.translations
 * so the public API (/api/v1/entries, /api/v1/tours) can serve already-
 * translated content via ?lang=.
 */

import { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Globe, Languages, Sparkles, Check, AlertCircle, RefreshCw, Loader,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  max-width: 900px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[5]};
`;

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[5]};
  h2 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0;
    color: ${colors.gray[900]};
  }
  .icon-wrap {
    width: 36px; height: 36px;
    border-radius: ${borders.radius.md};
    background: #6366f115;
    color: #6366f1;
    display: flex; align-items: center; justify-content: center;
    svg { width: 18px; height: 18px; }
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[4]};
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[1.5]};
  label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${colors.gray[500]};
  }
  select, input {
    padding: ${spacing[2.5]} ${spacing[3]};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    background: ${colors.white};
    font-family: ${typography.fontFamily.sans};
    color: ${colors.gray[900]};
    &:focus { outline: 2px solid ${colors.accent[300]}; border-color: ${colors.accent[400]}; }
  }
`;

const PrimaryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]};
  color: #fff;
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: ${typography.fontFamily.sans};
  svg { width: 16px; height: 16px; }
  &:hover { background: ${colors.accent[600]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ResultBox = styled.div<{ $kind: 'success' | 'error' | 'info' }>`
  margin-top: ${spacing[4]};
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  border: 1px solid;
  display: flex;
  align-items: flex-start;
  gap: ${spacing[3]};
  font-size: ${typography.fontSize.sm};
  ${p => p.$kind === 'success' ? `
    background: ${colors.green[50]}; border-color: ${colors.green[200]}; color: ${colors.green[800]};
  ` : p.$kind === 'error' ? `
    background: ${colors.red[50]}; border-color: ${colors.red[200]}; color: ${colors.red[800]};
  ` : `
    background: ${colors.gray[50]}; border-color: ${colors.gray[200]}; color: ${colors.gray[700]};
  `}
  svg { flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${spacing[3]};
  margin-top: ${spacing[3]};
`;

const Stat = styled.div<{ $color: string }>`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  padding: ${spacing[3]};
  text-align: center;
  .stat-value { font-size: 22px; font-weight: 700; color: ${p => p.$color}; line-height: 1; }
  .stat-label { font-size: 11px; color: ${colors.gray[500]}; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
`;

interface Collection {
  id: string;
  slug: string;
  name: string;
  type: string;
}

interface Language {
  code: string;
  name: string;
}

interface BulkResult {
  total: number;
  translated: number;
  skipped: number;
  errors: number;
}

export const I18nManager = () => {
  const toast = useToast();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [defaultLang, setDefaultLang] = useState<string>('pt');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedLang, setSelectedLang] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [allResult, setAllResult] = useState<{
    collections: number; languages: number;
    totals: BulkResult;
    matrix: Array<{ collection: string; language: string; total: number; translated: number; skipped: number; errors: number }>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [colsRes, langsRes] = await Promise.all([
      api.getCollections(),
      api.getI18nLanguages(),
    ]);

    // Filter out add-on internal collections — translating those just creates noise
    const SYSTEM_SLUGS = new Set([
      'i18n-config', 'i18n-translations', 'stripe-config', 'stripe-products',
      'stripe-transactions', 'orders', 'site-settings', 'redirects',
      'forms-config', 'form-submissions', 'newsletter-subscribers',
      'cookie-notice', 'accessibility', 'automations',
    ]);
    const userCollections = (colsRes.data || []).filter((c: Collection) => !SYSTEM_SLUGS.has(c.slug));
    setCollections(userCollections);

    if (langsRes.data) {
      setDefaultLang(langsRes.data.default || 'pt');
      // Available langs minus the default (we don't translate to the source lang)
      const targets = (langsRes.data.available || []).filter((l: Language) => l.code !== langsRes.data.default);
      setLanguages(targets);
      if (targets.length > 0) setSelectedLang(targets[0].code);
    }
    if (userCollections.length > 0) setSelectedCollection(userCollections[0].slug);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTranslateAll = async () => {
    if (!confirm('Translate every published entry across every user collection into every enabled language?\n\nThis may take a few minutes on first run. Already-translated entries are skipped (content-hash check), so it\'s safe to re-run.')) return;
    setRunningAll(true);
    setAllResult(null);
    setErrorMsg(null);
    try {
      const { data, error } = await api.translateEverything();
      if (error) {
        setErrorMsg(error);
        toast.error(error);
        return;
      }
      setAllResult(data);
      toast.success(`Full sync complete: ${data?.totals?.translated || 0} entries translated across ${data?.collections} collections × ${data?.languages} languages`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Sweep failed');
      toast.error(err.message || 'Sweep failed');
    } finally {
      setRunningAll(false);
    }
  };

  const handleRun = async () => {
    if (!selectedCollection || !selectedLang) return;
    setRunning(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const { data, error } = await api.translateBulk(selectedCollection, selectedLang);
      if (error) {
        setErrorMsg(error);
        toast.error(error);
        return;
      }
      setResult(data || null);
      toast.success(`Translated ${data?.translated || 0} entries to ${selectedLang.toUpperCase()}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Translation failed');
      toast.error(err.message || 'Translation failed');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Card>
          <div style={{ textAlign: 'center', padding: spacing[6], color: colors.gray[500] }}>
            <Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: spacing[3], fontSize: 14 }}>Loading…</p>
          </div>
        </Card>
      </Container>
    );
  }

  if (languages.length === 0) {
    return (
      <Container>
        <Header>
          <h1>Languages</h1>
          <p>Translate your content to multiple languages.</p>
        </Header>
        <Card>
          <ResultBox $kind="info">
            <AlertCircle />
            <div>
              <strong>i18n not configured.</strong>
              <div style={{ marginTop: 4 }}>
                Install the <em>Languages</em> add-on and create an <code>i18n-config</code> entry with your DeepL API key + at least one enabled target language.
              </div>
            </div>
          </ResultBox>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <h1>Languages</h1>
        <p>
          Translate your content automatically. Once configured, new and edited entries
          translate themselves on publish — you don't have to come here again.
        </p>
      </Header>

      {/* ── Primary action: translate everything ── */}
      <Card style={{ borderColor: '#6366f140' }}>
        <CardTitle>
          <div className="icon-wrap"><Globe /></div>
          <h2>Translate everything</h2>
        </CardTitle>
        <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], margin: `0 0 ${spacing[4]}` }}>
          Sweeps every user collection and translates every published entry into every enabled
          language ({languages.map(l => l.code.toUpperCase()).join(', ')}). Skips entries already
          up-to-date — safe to run anytime.
        </p>
        <PrimaryBtn onClick={handleTranslateAll} disabled={runningAll}>
          {runningAll ? (
            <>
              <Loader style={{ animation: 'spin 1s linear infinite' }} /> Running full sync…
            </>
          ) : (
            <>
              <Sparkles /> Translate everything
            </>
          )}
        </PrimaryBtn>

        {allResult && (
          <ResultBox $kind="success">
            <Check />
            <div style={{ flex: 1 }}>
              <strong>Full sync complete.</strong> {allResult.collections} collection{allResult.collections !== 1 ? 's' : ''} × {allResult.languages} language{allResult.languages !== 1 ? 's' : ''}.
              <StatGrid>
                <Stat $color={colors.gray[700]}>
                  <div className="stat-value">{allResult.totals.total}</div>
                  <div className="stat-label">Entries</div>
                </Stat>
                <Stat $color={colors.green[600]}>
                  <div className="stat-value">{allResult.totals.translated}</div>
                  <div className="stat-label">Translated</div>
                </Stat>
                <Stat $color={colors.gray[500]}>
                  <div className="stat-value">{allResult.totals.skipped}</div>
                  <div className="stat-label">Skipped</div>
                </Stat>
                <Stat $color={allResult.totals.errors > 0 ? colors.red[600] : colors.gray[400]}>
                  <div className="stat-value">{allResult.totals.errors}</div>
                  <div className="stat-label">Errors</div>
                </Stat>
              </StatGrid>
              {allResult.matrix.some(m => m.translated > 0 || m.errors > 0) && (
                <details style={{ marginTop: spacing[3] }}>
                  <summary style={{ cursor: 'pointer', fontSize: typography.fontSize.sm, color: colors.gray[600] }}>
                    Per-collection × per-language breakdown
                  </summary>
                  <div style={{ marginTop: spacing[2], fontSize: 12, color: colors.gray[600], fontFamily: typography.fontFamily.mono }}>
                    {allResult.matrix.map((row, idx) => (
                      <div key={idx} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.gray[100]}` }}>
                        <strong>{row.collection}</strong> → {row.language.toUpperCase()}: {row.translated} translated, {row.skipped} skipped{row.errors > 0 ? `, ${row.errors} errors` : ''}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </ResultBox>
        )}
      </Card>

      <Card>
        <CardTitle>
          <div className="icon-wrap"><Sparkles /></div>
          <h2>Bulk translate (single collection)</h2>
        </CardTitle>

        <FormRow>
          <Field>
            <label>Collection</label>
            <select
              value={selectedCollection}
              onChange={e => { setSelectedCollection(e.target.value); setResult(null); setErrorMsg(null); }}
              disabled={running}
            >
              {collections.map(c => (
                <option key={c.slug} value={c.slug}>{c.name} ({c.slug})</option>
              ))}
            </select>
          </Field>
          <Field>
            <label>Target language</label>
            <select
              value={selectedLang}
              onChange={e => { setSelectedLang(e.target.value); setResult(null); setErrorMsg(null); }}
              disabled={running}
            >
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.name} ({l.code.toUpperCase()})</option>
              ))}
            </select>
          </Field>
        </FormRow>

        <p style={{ fontSize: 12, color: colors.gray[500], margin: `${spacing[3]} 0 ${spacing[4]}` }}>
          Source language: <strong>{defaultLang.toUpperCase()}</strong>. Only entries whose content has
          changed since the last translation will be re-processed (content-hash check). DeepL is the
          translation engine — costs are billed against your tenant's DeepL key.
        </p>

        <PrimaryBtn onClick={handleRun} disabled={running || !selectedCollection || !selectedLang}>
          {running ? (
            <>
              <Loader style={{ animation: 'spin 1s linear infinite' }} /> Translating…
            </>
          ) : (
            <>
              <Languages /> Translate {selectedCollection || 'collection'} → {selectedLang.toUpperCase()}
            </>
          )}
        </PrimaryBtn>

        {errorMsg && (
          <ResultBox $kind="error">
            <AlertCircle />
            <div>
              <strong>Translation failed</strong>
              <div style={{ marginTop: 4, fontFamily: typography.fontFamily.mono, fontSize: 12 }}>
                {errorMsg}
              </div>
            </div>
          </ResultBox>
        )}

        {result && (
          <ResultBox $kind="success">
            <Check />
            <div style={{ flex: 1 }}>
              <strong>Done.</strong> Bulk translation completed.
              <StatGrid>
                <Stat $color={colors.gray[700]}>
                  <div className="stat-value">{result.total}</div>
                  <div className="stat-label">Total</div>
                </Stat>
                <Stat $color={colors.green[600]}>
                  <div className="stat-value">{result.translated}</div>
                  <div className="stat-label">Translated</div>
                </Stat>
                <Stat $color={colors.gray[500]}>
                  <div className="stat-value">{result.skipped}</div>
                  <div className="stat-label">Skipped</div>
                </Stat>
                <Stat $color={result.errors > 0 ? colors.red[600] : colors.gray[400]}>
                  <div className="stat-value">{result.errors}</div>
                  <div className="stat-label">Errors</div>
                </Stat>
              </StatGrid>
              <p style={{ fontSize: 12, color: colors.gray[600], marginTop: spacing[3] }}>
                "Skipped" entries already had up-to-date translations (content-hash matched).
              </p>
            </div>
          </ResultBox>
        )}
      </Card>

      <Card>
        <CardTitle>
          <div className="icon-wrap" style={{ background: colors.gray[100], color: colors.gray[600] }}><Globe /></div>
          <h2>How translations stay in sync</h2>
        </CardTitle>
        <ol style={{ margin: 0, paddingLeft: spacing[5], color: colors.gray[700], fontSize: typography.fontSize.sm, lineHeight: 1.7 }}>
          <li>One-time setup: run <strong>Translate everything</strong> above to seed all existing content.</li>
          <li>From then on, with <code>auto_translate</code> enabled in your i18n config, every <strong>publish</strong> or <strong>edit</strong> of an entry automatically refreshes its translations in the background — no manual step needed.</li>
          <li>Frontends pass <code>?lang=&lt;code&gt;</code> on every fetch and receive content already translated.</li>
          <li>Static UI labels (buttons, headers, navigation) are translated client-side by the embedded widget.</li>
          <li>Content-hash check skips work when nothing changed — translations are cheap and idempotent.</li>
        </ol>
      </Card>
    </Container>
  );
};
