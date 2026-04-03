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
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import { ArrowLeft, Loader } from 'lucide-react';

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

  const isEditMode = !!entryId;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch collection
        const { data: collectionData, error: collectionError } = await supabase
          .from('collections')
          .select('*')
          .eq('slug', collectionSlug)
          .single();

        if (collectionError) throw collectionError;
        setCollection(collectionData);

        // Fetch entry if in edit mode
        if (isEditMode) {
          const { data: entryData, error: entryError } = await supabase
            .from('entries')
            .select('*')
            .eq('id', entryId)
            .single();

          if (entryError) throw entryError;
          setEntry(entryData);
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [collectionSlug, entryId, isEditMode]);

  const handleSave = async (data: EntryData) => {
    if (!collection) return;

    try {
      if (isEditMode && entry) {
        // Update existing entry
        const { error } = await supabase
          .from('entries')
          .update({
            title: (data.title as string) || entry.title || 'Untitled',
            slug: (data.slug as string) || entry.slug || 'untitled',
            content: data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', entry.id);

        if (error) throw error;
      } else {
        // Create new entry
        if (!user) throw new Error('User not authenticated');

        const { error } = await supabase
          .from('entries')
          .insert({
            collection_id: collection.id,
            title: (data.title as string) || 'Untitled',
            slug: (data.slug as string) || 'untitled',
            content: data,
            status: 'draft',
            author_id: user.id,
          });

        if (error) throw error;

        // Navigate back to collection entries list
        navigate(`/content/${collection.slug}`);
      }
    } catch (err: any) {
      console.error('Error saving entry:', err);
      throw err; // Re-throw so EntryEditor can handle it
    }
  };

  const handleCancel = () => {
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
        <BackButton onClick={handleCancel}>
          <ArrowLeft />
          Back to {collection.name}
        </BackButton>
        <Title>
          {isEditMode ? 'Edit Entry' : 'Create New Entry'}
        </Title>
        <Subtitle>
          {collection.name} • {isEditMode ? `Editing ${entry?.id}` : 'New entry'}
        </Subtitle>
      </PageHeader>

      <EntryEditor
        fields={fields}
        initialData={entry?.content || {}}
        onSave={handleSave}
        onCancel={handleCancel}
        saveButtonText={isEditMode ? 'Update Entry' : 'Create Entry'}
      />
    </>
  );
}
