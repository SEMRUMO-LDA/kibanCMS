/**
 * EntryEdit Page
 *
 * Create or edit an entry
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { EntryEditor, type EntryData } from '../components/EntryEditor';
import { type FieldDefinition } from '../components/fields/FieldRenderer';
import { api } from '../lib/api';
import { ArrowLeft, Loader, Clock, Eye, Share2, Copy, PenLine } from 'lucide-react';
import { useToast } from '../components/Toast';
import { RevisionHistory } from '../components/RevisionHistory';
import { LivePreview } from '../components/LivePreview';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const PageHeader = styled.header`
  margin-bottom: ${spacing[8]};
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[4]};
  margin-bottom: ${spacing[4]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[700]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};

  &:hover {
    background: ${colors.gray[50]};
    border-color: ${colors.gray[400]};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Title = styled.h1`
  font-size: ${typography.fontSize['3xl']};
  font-weight: ${typography.fontWeight.bold};
  margin: 0 0 ${spacing[2]} 0;
  letter-spacing: ${typography.letterSpacing.tight};
  color: ${colors.gray[900]};
`;

const Subtitle = styled.p`
  font-size: ${typography.fontSize.base};
  color: ${colors.gray[600]};
  margin: 0;
  display: inline-flex; align-items: center; gap: ${spacing[2]};
`;

const IdChip = styled.button`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px;
  background: ${colors.gray[100]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  font-family: ${typography.fontFamily.mono};
  font-size: 12px;
  color: ${colors.gray[700]};
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  &:hover { background: ${colors.gray[200]}; color: ${colors.gray[900]}; }
  svg { width: 12px; height: 12px; }
`;

// Compact action row inside the PublishBox — same look as the box's own
// rows so History / Share Preview / Preview line up cleanly above the
// status selector.
const PublishBoxRow = styled.button`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  width: 100%;
  padding: ${spacing[2]} 0;
  background: none;
  border: none;
  text-align: left;
  font-family: ${typography.fontFamily.sans};
  font-size: 13px;
  font-weight: 500;
  color: ${colors.gray[700]};
  cursor: pointer;
  transition: color 0.15s;
  svg { width: 14px; height: 14px; flex-shrink: 0; color: ${colors.gray[500]}; }
  &:hover { color: ${colors.gray[900]}; svg { color: ${colors.gray[700]}; } }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: ${spacing[4]};

  svg {
    animation: ${spin} 1s linear infinite;
    color: ${colors.accent[500]};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.sm};
  }
`;

const ErrorContainer = styled.div`
  padding: ${spacing[8]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.xl};
  text-align: center;

  h2 {
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[2]} 0;
  }

  p {
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

interface Collection {
  id: string;
  slug: string;
  name: string;
  fields: FieldDefinition[];
}

interface Entry {
  id: string;
  title: string;
  slug: string;
  content: EntryData;
  status: 'draft' | 'published' | 'archived';
  version?: number;
  meta?: Record<string, any> | null;
}

/** A change made on the live site ("Editar no site", beta) waiting for approval. */
interface InlinePending {
  field: string;
  value: unknown;
  lang: string | null;
  previous: unknown;
  by: string;
  at: string;
}

const PendingBox = styled.div`
  background: #faf5ff;
  border: 1px solid #d8b4fe;
  border-radius: ${borders.radius.xl};
  padding: ${spacing[4]} ${spacing[5]};
  margin-bottom: ${spacing[5]};
  h3 { margin: 0 0 ${spacing[1]}; font-size: ${typography.fontSize.sm}; font-weight: 600; color: #6b21a8; display: flex; align-items: center; gap: ${spacing[2]}; }
  p.hint { margin: 0 0 ${spacing[3]}; font-size: 12px; color: #7e22ce; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${spacing[2]}; }
  li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: ${spacing[3]}; align-items: center; background: ${colors.white}; border: 1px solid #e9d5ff; border-radius: ${borders.radius.lg}; padding: ${spacing[2.5]} ${spacing[3]}; font-size: ${typography.fontSize.sm}; }
  .what { color: ${colors.gray[500]}; font-size: 12px; margin-bottom: 2px; }
  .what b { color: ${colors.gray[800]}; font-weight: 600; }
  .lang { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: #ede9fe; color: #6d28d9; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
  .diff { display: flex; flex-wrap: wrap; gap: ${spacing[2]}; align-items: center; min-width: 0; }
  .diff .old { color: ${colors.gray[400]}; text-decoration: line-through; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
  .diff .new { color: ${colors.gray[900]}; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
  .diff img { height: 36px; width: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${colors.gray[200]}; }
  .who { color: ${colors.gray[400]}; font-size: 11px; margin-top: 2px; }
  .row-actions { display: flex; gap: ${spacing[1.5]}; }
  .actions { display: flex; gap: ${spacing[2]}; margin-top: ${spacing[3]}; justify-content: flex-end; }
  button { font-family: inherit; font-size: 12px; font-weight: 600; border-radius: ${borders.radius.md}; padding: ${spacing[1.5]} ${spacing[3]}; cursor: pointer; border: 1px solid transparent; }
  button:disabled { opacity: .5; cursor: default; }
  button.apply { background: #7c3aed; color: ${colors.white}; }
  button.apply:hover:not(:disabled) { background: #6d28d9; }
  button.reject { background: ${colors.white}; color: ${colors.gray[700]}; border-color: ${colors.gray[300]}; }
  button.reject:hover:not(:disabled) { background: ${colors.gray[50]}; }
`;

const IMAGE_FIELD_RE = /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i;

function pendingLabel(field: string, fields: FieldDefinition[]): string {
  if (field === 'title') return 'Título';
  if (field === 'excerpt') return 'Resumo';
  if (field === 'featured_image') return 'Imagem destacada';
  const key = field.startsWith('content.') ? field.slice(8) : field;
  const def = fields.find(f => (f as any).id === key);
  return (def as any)?.name || key;
}

function PendingValue({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && typeof (value as any).url === 'string') value = (value as any).url;
  if (typeof value === 'string' && /^https?:\/\//.test(value) && IMAGE_FIELD_RE.test(value)) return <img src={value} alt="" />;
  if (value === null || value === undefined || value === '') return <span style={{ color: colors.gray[400] }}>(vazio)</span>;
  return <span>{String(value)}</span>;
}

// Stable references. The editor re-initialises its form whenever
// `initialData`/`fields` change identity, so passing a fresh `{}`/`[]` on
// every render wiped whatever the user was typing in a NEW entry each time
// the page re-rendered (first keystroke, any toast, returning to the tab…).
const EMPTY_CONTENT: EntryData = {};
const EMPTY_FIELDS: FieldDefinition[] = [];

export function EntryEdit() {
  const { collectionSlug, entryId } = useParams<{ collectionSlug: string; entryId?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showRevisions, setShowRevisions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isEditMode = !!entryId;

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch collection via API
        const { data: colData, error: colErr } = await api.getCollection(collectionSlug!);
        if (colErr || !colData) throw new Error(colErr || 'Collection not found');
        setCollection(colData);

        // Fetch entry via API if editing. We previously listed the whole
        // collection and filtered client-side which broke for collections
        // larger than the listing limit (100/500) and silently dropped
        // soft-deleted entries. Direct UUID lookup is reliable.
        if (isEditMode && entryId) {
          const { data: entryData, error: entryErr } = await api.getEntryById(entryId);
          if (entryErr || !entryData) throw new Error(entryErr || 'Entry not found');
          setEntry(entryData);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, [collectionSlug, entryId, isEditMode]);

  const handleSave = async (data: EntryData, status: string) => {
    if (!collection) return;
    setSaveStatus('saving');

    // Extract a human-readable title from the data:
    // 1. Explicit title/name field
    // 2. First non-empty string value from any field
    // 3. Fallback to "Untitled"
    // Fields whose KEY matches SECRET_FIELD_RE are skipped during
    // auto-derivation. Otherwise an operator pasting e.g. a 200-char Stripe
    // publishable key into the only field ends up with a 200-char title (and
    // slug), silently breaking the edit route and locking themselves out of
    // their own data. Length caps are a final safety net.
    const SECRET_FIELD_RE = /(secret|password|token|webhook|_key\b|api_key)/i;
    const MAX_TITLE_LEN = 120;
    const MAX_SLUG_LEN = 80;

    const autoFromField = Object.entries(data).find(
      ([k, v]) => !SECRET_FIELD_RE.test(k) && typeof v === 'string' && v.trim().length > 0
    )?.[1] as string | undefined;

    const rawTitle =
      (typeof data.title === 'string' && data.title.trim()) ||
      (typeof data.name === 'string' && data.name.trim()) ||
      autoFromField ||
      'Untitled';

    const title = String(rawTitle).trim().slice(0, MAX_TITLE_LEN);

    const slugify = (value: string) => (value
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'entry').slice(0, MAX_SLUG_LEN);

    // The slug is the public URL of the entry. It is derived from the title
    // only when the entry is CREATED. On edit we keep the existing slug, so
    // fixing a typo in a published title doesn't silently change its URL
    // (breaking links/SEO) — unless the collection has an explicit `slug` field.
    const explicitSlug = typeof data.slug === 'string' && data.slug.trim() ? slugify(data.slug) : null;
    const slug = explicitSlug || (isEditMode && entry ? entry.slug : slugify(title));

    try {
      if (isEditMode && entry && collectionSlug) {
        const { data: result, error } = await api.updateEntry(collectionSlug, entry.slug, {
          title, slug, content: data, status,
          version: entry.version, // Optimistic locking — server rejects if version changed
        });
        if (error) {
          // Conflict: another user modified this entry since we loaded it
          if (error.includes('Conflict') || error.includes('409')) {
            const reload = confirm(
              'This entry was modified by another user since you opened it.\n\n' +
              'Click OK to reload the latest version (your unsaved changes will be lost), ' +
              'or Cancel to keep editing (you will need to copy your changes and reload manually).'
            );
            if (reload) {
              window.location.reload();
              return;
            }
            setSaveStatus('idle');
            return;
          }
          throw new Error(error);
        }
        // Sync version/slug/title with the server. `content` is deliberately
        // left untouched: replacing it would re-initialise the editor form.
        setEntry(prev => prev ? {
          ...prev,
          title,
          slug: result?.slug || slug,
          ...(result?.version ? { version: result.version } : {}),
        } : prev);
        setIsDirty(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        if (!collectionSlug) throw new Error('No collection selected');
        const { error } = await api.createEntry(collectionSlug, {
          title, slug, content: data, status,
        });
        if (error) throw new Error(error);
        setIsDirty(false);
        navigate(`/content/${collectionSlug}`);
      }
    } catch (err: any) {
      console.error('Error saving entry:', err);
      setSaveStatus('idle');
      throw err;
    }
  };

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
    navigate(`/content/${collectionSlug}`);
  };

  // ── Changes made on the live site (beta) awaiting approval ──
  const [pendingBusy, setPendingBusy] = useState(false);
  const inlinePending: InlinePending[] = Array.isArray(entry?.meta?.inline_pending) ? entry!.meta!.inline_pending : [];

  const resolvePending = async (action: 'apply' | 'discard', indexes?: number[]) => {
    if (!entry || pendingBusy) return;
    if (isDirty) {
      toast.error('Guarde primeiro as suas alterações — a aprovação recarrega a entrada.');
      return;
    }
    setPendingBusy(true);
    try {
      const { error } = action === 'apply'
        ? await api.applyInlinePending(entry.id, indexes)
        : await api.discardInlinePending(entry.id, indexes);
      if (error) throw new Error(error);
      const { data: fresh, error: reloadErr } = await api.getEntryById(entry.id);
      if (reloadErr || !fresh) throw new Error(reloadErr || 'Não foi possível recarregar a entrada');
      setEntry(fresh);
      toast.success(action === 'apply' ? 'Alterações do site aplicadas e guardadas.' : 'Alterações do site rejeitadas.');
    } catch (err: any) {
      toast.error(err.message || 'Operação falhou');
    } finally {
      setPendingBusy(false);
    }
  };

  const handleSharePreview = async () => {
    if (!entry) return;
    if (isDirty) {
      toast.error('Save your changes first — preview shows the saved version.');
      return;
    }
    setGeneratingPreview(true);
    try {
      const { data, error } = await api.createPreviewToken(entry.id);
      if (error || !data) {
        toast.error(error || 'Failed to generate preview link');
        return;
      }
      // Build the URL the editor will share. The {tenant-frontend}/preview/...
      // page must accept ?token=… and call /api/v1/preview/entry?token=… on
      // the kibanCMS API. We expose the API URL too so frontends can construct
      // their own preview routes.
      const apiBase = (import.meta.env.VITE_API_URL || window.location.origin) + '/api/v1';
      const previewUrl = `${apiBase}/preview/entry?token=${encodeURIComponent(data.token)}`;
      try {
        await navigator.clipboard.writeText(previewUrl);
        toast.success(`Preview link copied — valid until ${new Date(data.expires_at).toLocaleString('pt-PT')}`);
      } catch {
        // Clipboard blocked — fall back to a prompt the user can copy manually
        prompt('Copy this preview URL (valid 24h):', previewUrl);
      }
    } catch (err: any) {
      toast.error('Failed to generate preview: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingPreview(false);
    }
  };

  if (loading) {
    return (
      <LoadingContainer>
        <Loader size={32} />
        <p>Loading...</p>
      </LoadingContainer>
    );
  }

  if (error || !collection) {
    return (
      <ErrorContainer>
        <h2>Error</h2>
        <p>{error || 'Collection not found'}</p>
        <BackButton onClick={() => navigate('/content')} style={{ marginTop: spacing[4] }}>
          <ArrowLeft />
          Back to Collections
        </BackButton>
      </ErrorContainer>
    );
  }

  const fields = collection.fields || EMPTY_FIELDS;

  return (
    <>
      <PageHeader>
        <BackButton onClick={handleCancel}>
          <ArrowLeft />
          Back to {collection.name}
        </BackButton>
        <Title>
          {isEditMode ? 'Edit Entry' : 'Create New Entry'}
        </Title>
        <Subtitle>
          <span>{collection.name}{isEditMode ? ' • Editing' : ' • New entry'}</span>
          {isEditMode && entry?.id && (
            <IdChip
              type="button"
              title="Copy entry ID"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(entry.id);
                  toast.success('Entry ID copied');
                } catch {
                  prompt('Copy this entry ID:', entry.id);
                }
              }}
            >
              {entry.id}
              <Copy />
            </IdChip>
          )}
        </Subtitle>
      </PageHeader>

      {/* Save status indicator */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          padding: '8px 16px', borderRadius: '8px',
          background: saveStatus === 'saving' ? colors.gray[800] : '#16a34a',
          color: '#fff', fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: shadows.lg,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </div>
      )}

      {isEditMode && entry && inlinePending.length > 0 && (
        <PendingBox role="region" aria-label="Alterações feitas no site">
          <h3><PenLine size={15} /> {inlinePending.length === 1 ? '1 alteração feita no site' : `${inlinePending.length} alterações feitas no site`} a aguardar aprovação</h3>
          <p className="hint">Feitas com "Editar no site" (beta). Nada foi publicado ainda: aplique para as guardar na entrada ou rejeite.</p>
          <ul>
            {inlinePending.map((p, i) => (
              <li key={`${p.field}-${p.lang || ''}-${i}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="what"><b>{pendingLabel(p.field, fields)}</b>{p.lang && <span className="lang">{p.lang.toUpperCase()}</span>}</div>
                  <div className="diff">
                    <span className="old"><PendingValue value={p.previous} /></span>
                    <span aria-hidden="true">→</span>
                    <span className="new"><PendingValue value={p.value} /></span>
                  </div>
                  <div className="who">{p.by} · {new Date(p.at).toLocaleString('pt-PT')}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="reject" disabled={pendingBusy} onClick={() => resolvePending('discard', [i])}>Rejeitar</button>
                  <button type="button" className="apply" disabled={pendingBusy} onClick={() => resolvePending('apply', [i])}>Aplicar</button>
                </div>
              </li>
            ))}
          </ul>
          {inlinePending.length > 1 && (
            <div className="actions">
              <button type="button" className="reject" disabled={pendingBusy} onClick={() => resolvePending('discard')}>Rejeitar todas</button>
              <button type="button" className="apply" disabled={pendingBusy} onClick={() => resolvePending('apply')}>{pendingBusy ? 'A aplicar…' : 'Aplicar todas'}</button>
            </div>
          )}
        </PendingBox>
      )}

      <EntryEditor
        fields={fields}
        initialData={entry?.content || EMPTY_CONTENT}
        initialStatus={entry?.status || 'draft'}
        onSave={handleSave}
        onCancel={handleCancel}
        saveButtonText={isEditMode ? 'Update Entry' : 'Create Entry'}
        onChange={() => setIsDirty(true)}
        extraActions={
          <>
            {isEditMode && entry && (
              <PublishBoxRow onClick={() => setShowRevisions(true)}>
                <Clock /> History
              </PublishBoxRow>
            )}
            {isEditMode && entry && (
              <PublishBoxRow onClick={handleSharePreview} disabled={generatingPreview}>
                <Share2 /> {generatingPreview ? 'Generating…' : 'Share Preview'}
              </PublishBoxRow>
            )}
            <PublishBoxRow onClick={() => setShowPreview(!showPreview)}>
              <Eye /> {showPreview ? 'Hide Preview' : 'Preview'}
            </PublishBoxRow>
          </>
        }
      />

      {showRevisions && entry && (
        <RevisionHistory
          entryId={entry.id}
          currentVersion={(entry as any).version || 1}
          onRestore={(content, title) => {
            setEntry(prev => prev ? { ...prev, content, title } : prev);
            setIsDirty(true);
          }}
          onClose={() => setShowRevisions(false)}
        />
      )}

      {showPreview && collection && (
        <LivePreview
          previewUrl=""
          entryData={entry?.content || EMPTY_CONTENT}
          collectionSlug={collection.slug}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
