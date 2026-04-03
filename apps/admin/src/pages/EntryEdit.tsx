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
import { ArrowLeft, Loader, Clock } from 'lucide-react';
import { RevisionHistory } from '../components/RevisionHistory';

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
}

export function EntryEdit() {
  const { collectionSlug, entryId } = useParams<{ collectionSlug: string; entryId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showRevisions, setShowRevisions] = useState(false);

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

        // Fetch entry via API if editing
        if (isEditMode && collectionSlug) {
          // Need to find entry by ID — use entries list filtered
          const { data: entriesData } = await api.getEntries(collectionSlug);
          const found = (entriesData || []).find((e: any) => e.id === entryId);
          if (found) setEntry(found);
          else throw new Error('Entry not found');
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
    const title =
      (data.title as string) ||
      (data.name as string) ||
      Object.values(data).find(v => typeof v === 'string' && v.trim().length > 0) as string ||
      'Untitled';

    const slug = title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'entry';

    try {
      if (isEditMode && entry && collectionSlug) {
        const { error } = await api.updateEntry(collectionSlug, entry.slug, {
          title, slug, content: data, status,
        });
        if (error) throw new Error(error);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onClick={handleCancel}>
            <ArrowLeft />
            Back to {collection.name}
          </BackButton>
          {isEditMode && entry && (
            <BackButton onClick={() => setShowRevisions(true)} style={{ marginBottom: '16px' }}>
              <Clock />
              History
            </BackButton>
          )}
        </div>
        <Title>
          {isEditMode ? 'Edit Entry' : 'Create New Entry'}
        </Title>
        <Subtitle>
          {collection.name} • {isEditMode ? `Editing ${entry?.id}` : 'New entry'}
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

      <EntryEditor
        fields={fields}
        initialData={entry?.content || {}}
        initialStatus={entry?.status || 'draft'}
        onSave={handleSave}
        onCancel={handleCancel}
        saveButtonText={isEditMode ? 'Update Entry' : 'Create Entry'}
        onChange={() => setIsDirty(true)}
      />

      {showRevisions && entry && (
        <RevisionHistory
          entryId={entry.id}
          currentVersion={(entry as any).version || 1}
          onRestore={(content, title) => {
            // Update entry state so EntryEditor re-renders with restored content
            setEntry(prev => prev ? { ...prev, content, title } : prev);
            setIsDirty(true);
          }}
          onClose={() => setShowRevisions(false)}
        />
      )}
    </>
  );
}
