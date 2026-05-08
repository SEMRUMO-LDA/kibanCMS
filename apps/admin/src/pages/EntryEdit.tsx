/**
 * EntryEdit Page
 *
 * Create or edit an entry
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { EntryEditor, type EntryData } from '../components/EntryEditor';
import { type FieldDefinition } from '../components/fields/FieldRenderer';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { ArrowLeft, Loader, Clock, Eye, Share2, Copy } from 'lucide-react';
import { useToast } from '../components/Toast';
import { RevisionHistory } from '../components/RevisionHistory';
import { LivePreview } from '../components/LivePreview';
import { EditingPresence } from '../components/EditingPresence';

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
}

export function EntryEdit() {
  const { collectionSlug, entryId } = useParams<{ collectionSlug: string; entryId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [previewData, setPreviewData] = useState<any>({});

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

    const slug = (title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'entry').slice(0, MAX_SLUG_LEN);

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
        // Update local version to match server after successful save
        if (result?.version) {
          setEntry(prev => prev ? { ...prev, version: result.version } : prev);
        }
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

  const fields = collection.fields || [];

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

      {isEditMode && entry && <EditingPresence entryId={entry.id} />}

      <EntryEditor
        fields={fields}
        initialData={entry?.content || {}}
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
          entryData={entry?.content || {}}
          collectionSlug={collection.slug}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
