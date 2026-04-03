import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import { FileText, ArrowRight, Loader, Code, Plus, Pencil, Trash2 } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { CodeSnippetModal } from '../components/CodeSnippetModal';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const shimmer = keyframes`
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1400px;
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${spacing[4]};

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: ${typography.fontSize['3xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[2]} 0;
    letter-spacing: ${typography.letterSpacing.tight};
    color: ${colors.gray[900]};
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;

    strong {
      color: ${colors.gray[900]};
      font-weight: ${typography.fontWeight.semibold};
    }
  }
`;

const NewCollectionButton = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};
  white-space: nowrap;

  &:hover {
    background: ${colors.accent[600]};
    transform: translateY(-1px);
    box-shadow: ${shadows.md};
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: ${spacing[6]};
  margin-bottom: ${spacing[8]};
`;

const CollectionCard = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  cursor: pointer;
  transition: all ${animations.duration.normal} ${animations.easing.out};
  box-shadow: ${shadows.sm};
  display: flex;
  flex-direction: column;
  min-height: 200px;

  &:hover {
    transform: translateY(-4px);
    box-shadow: ${shadows.lg};
    border-color: ${colors.accent[300]};

    .arrow {
      transform: translateX(4px);
      color: ${colors.accent[600]};
    }

    .icon-wrapper {
      background: ${colors.accent[100]};
      border-color: ${colors.accent[300]};
    }
  }

  &:active {
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[4]};

  .icon-wrapper {
    width: 56px;
    height: 56px;
    border-radius: ${borders.radius.xl};
    background: ${colors.gray[100]};
    border: 1px solid ${colors.gray[200]};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all ${animations.duration.normal} ${animations.easing.out};

    svg {
      color: ${colors.gray[600]};
      transition: color ${animations.duration.fast} ${animations.easing.out};
    }
  }

  .info {
    flex: 1;
    min-width: 0;

    h3 {
      font-size: ${typography.fontSize.xl};
      font-weight: ${typography.fontWeight.semibold};
      margin: 0 0 ${spacing[1]} 0;
      color: ${colors.gray[900]};
      letter-spacing: ${typography.letterSpacing.tight};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .type-badge {
      display: inline-flex;
      align-items: center;
      padding: ${spacing[1]} ${spacing[2.5]};
      border-radius: ${borders.radius.full};
      font-size: ${typography.fontSize.xs};
      font-weight: ${typography.fontWeight.semibold};
      text-transform: uppercase;
      letter-spacing: ${typography.letterSpacing.wide};
      background: ${colors.gray[100]};
      color: ${colors.gray[600]};
    }
  }
`;

const CardDescription = styled.p`
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[600]};
  line-height: ${typography.lineHeight.relaxed};
  margin: 0 0 ${spacing[5]} 0;
  flex: 1;
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: ${spacing[4]};
  border-top: 1px solid ${colors.gray[200]};

  .arrow {
    color: ${colors.gray[400]};
    transition: all ${animations.duration.normal} ${animations.easing.out};
  }
`;

const CodeButton = styled.button`
  background: none;
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  padding: ${spacing[2]} ${spacing[3]};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[600]};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.accent[50]};
    border-color: ${colors.accent[300]};
    color: ${colors.accent[700]};

    svg {
      color: ${colors.accent[600]};
    }
  }

  svg {
    width: 14px;
    height: 14px;
    transition: color ${animations.duration.fast} ${animations.easing.out};
  }
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;

const ActionBtn = styled.button`
  background: none;
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  padding: ${spacing[2]};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.gray[500]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};

  svg {
    width: 15px;
    height: 15px;
  }

  &:hover {
    background: ${colors.gray[50]};
    border-color: ${colors.gray[300]};
    color: ${colors.gray[700]};
  }

  &.delete:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing[16]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};

  svg {
    animation: ${spin} 1s linear infinite;
    color: ${colors.accent[500]};
    margin-bottom: ${spacing[4]};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.sm};
    margin: 0;
  }
`;

const ErrorState = styled.div`
  padding: ${spacing[8]};
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: ${borders.radius.xl};
  text-align: center;

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: #991b1b;
    margin: 0 0 ${spacing[2]} 0;
  }

  p {
    color: #7f1d1d;
    margin: 0;
    font-size: ${typography.fontSize.sm};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[16]} ${spacing[8]};
  background: ${colors.white};
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.xl};

  .empty-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto ${spacing[6]};
    border-radius: ${borders.radius.full};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};

    svg {
      width: 40px;
      height: 40px;
    }
  }

  h3 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    color: ${colors.gray[600]};
    margin: 0 0 ${spacing[6]} 0;
    font-size: ${typography.fontSize.sm};
    line-height: ${typography.lineHeight.relaxed};
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }

  .hint {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin-top: ${spacing[4]};

    code {
      font-family: ${typography.fontFamily.mono};
      background: ${colors.gray[100]};
      padding: ${spacing[1]} ${spacing[2]};
      border-radius: ${borders.radius.md};
      font-size: ${typography.fontSize.xs};
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'post' | 'page' | 'custom';
  icon: string | null;
  color: string | null;
}

// ============================================
// COMPONENT
// ============================================

export const Collections = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const handleDelete = async (e: React.MouseEvent, collection: Collection) => {
    e.stopPropagation();
    if (!confirm(`Delete "${collection.name}" and ALL its entries? This cannot be undone.`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('collections')
        .delete()
        .eq('id', collection.id);

      if (deleteError) throw deleteError;
      setCollections(prev => prev.filter(c => c.id !== collection.id));
    } catch (err: any) {
      alert('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  useEffect(() => {
    let active = true;

    async function fetchCollections() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('collections')
          .select('id, name, slug, description, type, icon, color, created_at, updated_at')
          .order('name', { ascending: true });

        if (fetchError) throw new Error(fetchError.message);

        if (active) {
          setCollections(data || []);
        }
      } catch (err: any) {
        console.error('[Collections] Error fetching collections:', err);
        if (active) {
          const errorMsg = err.message || 'Failed to load collections';
          setError(errorMsg);

          // Show helpful message based on error type
          if (errorMsg.includes('JWT')) {
            setError('Authentication error. Please try logging out and back in.');
          } else if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
            setError('Connection timeout. Please check your internet connection or try again.');
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (user) {
      fetchCollections();
    }

    return () => { active = false; };
  }, [user?.id]);

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Loader size={40} />
          <p>Loading collections...</p>
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorState>
          <h3>Error Loading Collections</h3>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: spacing[4],
              padding: `${spacing[2]} ${spacing[4]}`,
              background: colors.accent[500],
              color: colors.white,
              border: 'none',
              borderRadius: borders.radius.md,
              cursor: 'pointer',
              fontWeight: typography.fontWeight.semibold,
              fontSize: typography.fontSize.sm,
            }}
          >
            Retry
          </button>
        </ErrorState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <div className="header-content">
          <h1>Content Collections</h1>
          <p>
            <strong>{user?.email}</strong> • Role: <strong>{profile?.role || 'viewer'}</strong>
          </p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
          <NewCollectionButton onClick={() => navigate('/content/builder')}>
            <Plus />
            New Collection
          </NewCollectionButton>
        )}
      </Header>

      {collections.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <FileText />
          </div>
          <h3>No Collections Found</h3>
          <p>
            No content collections have been created yet. Run the seed script in the Supabase SQL
            Editor to create sample collections.
          </p>
          <div className="hint">
            Open <code>database/migrations/RESET_AND_SEED.sql</code> in the SQL Editor
          </div>
        </EmptyState>
      ) : (
        <Grid>
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              onClick={() => navigate(`/content/${collection.slug}`)}
            >
              <CardHeader>
                <div className="icon-wrapper">
                  <FileText size={24} />
                </div>
                <div className="info">
                  <h3>{collection.name}</h3>
                  <span className="type-badge">{collection.type}</span>
                </div>
              </CardHeader>

              <CardDescription>
                {collection.description || 'No description available.'}
              </CardDescription>

              <CardFooter>
                <CardActions>
                  <CodeButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCollection(collection);
                    }}
                  >
                    <Code />
                    Get Code
                  </CodeButton>
                  {isAdmin && (
                    <>
                      <ActionBtn
                        title="Edit collection"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/content/${collection.slug}/edit-collection`);
                        }}
                      >
                        <Pencil />
                      </ActionBtn>
                      <ActionBtn
                        className="delete"
                        title="Delete collection"
                        onClick={(e) => handleDelete(e, collection)}
                      >
                        <Trash2 />
                      </ActionBtn>
                    </>
                  )}
                </CardActions>
                <ArrowRight size={20} className="arrow" />
              </CardFooter>
            </CollectionCard>
          ))}
        </Grid>
      )}

      {selectedCollection && (
        <CodeSnippetModal
          collectionSlug={selectedCollection.slug}
          collectionName={selectedCollection.name}
          onClose={() => setSelectedCollection(null)}
        />
      )}
    </Container>
  );
};
