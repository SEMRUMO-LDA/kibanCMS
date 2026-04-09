import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useI18n } from '../lib/i18n';
import {
  FileText, ArrowRight, Loader, Plus, Pencil, Trash2,
  Mail, Search, CreditCard, CalendarCheck, Zap, Sparkles, Package,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { ADDONS_REGISTRY } from '../config/addons-registry';

// Icon map for add-on cards
const ADDON_ICON_MAP: Record<string, any> = {
  'mail': Mail,
  'search': Search,
  'credit-card': CreditCard,
  'calendar-check': CalendarCheck,
  'zap': Zap,
  'sparkles': Sparkles,
  'file-input': FileText,
  'arrow-right': ArrowRight,
};

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

  .header-content { flex: 1; }

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
    strong { color: ${colors.gray[900]}; font-weight: ${typography.fontWeight.semibold}; }
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

  &:hover { background: ${colors.accent[600]}; transform: translateY(-1px); box-shadow: ${shadows.md}; }
  &:active { transform: translateY(0); }
  svg { width: 18px; height: 18px; }
`;

const SectionLabel = styled.h2`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${colors.gray[500]};
  margin: 0 0 ${spacing[4]} 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: ${spacing[6]};
  margin-bottom: ${spacing[8]};
`;

// ── Standalone collection card ──

const CollectionCard = styled.div<{ $accentColor?: string }>`
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
  position: relative;
  overflow: hidden;

  ${props => props.$accentColor ? `border-top: 3px solid ${props.$accentColor};` : ''}

  &:hover {
    transform: translateY(-4px);
    box-shadow: ${shadows.lg};
    border-color: ${props => props.$accentColor || colors.accent[300]};
    ${props => props.$accentColor ? `border-top-color: ${props.$accentColor};` : ''}
    .arrow { transform: translateX(4px); color: ${props => props.$accentColor || colors.accent[600]}; }
  }

  &:active { transform: translateY(-2px); }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[4]};

  .icon-wrapper {
    width: 56px; height: 56px;
    border-radius: ${borders.radius.xl};
    background: ${colors.gray[100]};
    border: 1px solid ${colors.gray[200]};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all ${animations.duration.normal} ${animations.easing.out};
    svg { color: ${colors.gray[600]}; }
  }

  .info {
    flex: 1; min-width: 0;
    h3 {
      font-size: ${typography.fontSize.xl};
      font-weight: ${typography.fontWeight.semibold};
      margin: 0 0 ${spacing[1]} 0;
      color: ${colors.gray[900]};
      letter-spacing: ${typography.letterSpacing.tight};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .type-badge {
      display: inline-flex; align-items: center;
      padding: ${spacing[1]} ${spacing[2.5]};
      border-radius: ${borders.radius.full};
      font-size: ${typography.fontSize.xs};
      font-weight: ${typography.fontWeight.semibold};
      text-transform: uppercase;
      letter-spacing: ${typography.letterSpacing.wide};
      background: ${colors.gray[100]}; color: ${colors.gray[600]};
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
  .arrow { color: ${colors.gray[400]}; transition: all ${animations.duration.normal} ${animations.easing.out}; }
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
  display: flex; align-items: center; justify-content: center;
  color: ${colors.gray[500]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};
  svg { width: 15px; height: 15px; }

  &:hover { background: ${colors.gray[50]}; border-color: ${colors.gray[300]}; color: ${colors.gray[700]}; }
  &.delete:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
`;

// ── Add-on grouped card ──

const AddonCard = styled.div<{ $color: string }>`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  box-shadow: ${shadows.sm};
  transition: all ${animations.duration.normal} ${animations.easing.out};

  &:hover {
    box-shadow: ${shadows.lg};
    border-color: ${p => p.$color}40;
  }
`;

const AddonCardTop = styled.div<{ $color: string }>`
  height: 4px;
  background: ${p => p.$color};
`;

const AddonCardBody = styled.div`
  padding: ${spacing[5]};
`;

const AddonCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};

  .addon-icon {
    width: 44px; height: 44px;
    border-radius: ${borders.radius.lg};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    svg { width: 22px; height: 22px; }
  }

  .addon-info { flex: 1; }
  .addon-name {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
  }
  .addon-meta {
    font-size: 12px;
    color: ${colors.gray[500]};
    margin-top: 2px;
  }
`;

const AddonCollectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

const AddonCollectionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.gray[50]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${colors.gray[100]};
    .row-arrow { transform: translateX(3px); color: ${colors.accent[600]}; }
  }

  .row-left {
    display: flex;
    align-items: center;
    gap: ${spacing[3]};
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .row-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .row-name {
    font-size: ${typography.fontSize.sm};
    font-weight: 600;
    color: ${colors.gray[800]};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .row-desc {
    font-size: 12px;
    color: ${colors.gray[500]};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .row-right {
    display: flex;
    align-items: center;
    gap: ${spacing[2]};
    flex-shrink: 0;
  }

  .row-arrow {
    color: ${colors.gray[400]};
    transition: all 0.15s;
    width: 16px; height: 16px;
  }
`;

// ── States ──

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing[16]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  svg { animation: ${spin} 1s linear infinite; color: ${colors.accent[500]}; margin-bottom: ${spacing[4]}; }
  p { color: ${colors.gray[600]}; font-size: ${typography.fontSize.sm}; margin: 0; }
`;

const ErrorState = styled.div`
  padding: ${spacing[8]};
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: ${borders.radius.xl};
  text-align: center;
  h3 { font-size: ${typography.fontSize.lg}; font-weight: ${typography.fontWeight.semibold}; color: #991b1b; margin: 0 0 ${spacing[2]} 0; }
  p { color: #7f1d1d; margin: 0; font-size: ${typography.fontSize.sm}; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[16]} ${spacing[8]};
  background: ${colors.white};
  border: 2px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.xl};

  .empty-icon {
    width: 80px; height: 80px;
    margin: 0 auto ${spacing[6]};
    border-radius: ${borders.radius.full};
    background: ${colors.gray[100]};
    display: flex; align-items: center; justify-content: center;
    color: ${colors.gray[400]};
    svg { width: 40px; height: 40px; }
  }

  h3 { font-size: ${typography.fontSize.xl}; font-weight: ${typography.fontWeight.semibold}; margin: 0 0 ${spacing[2]} 0; color: ${colors.gray[900]}; }
  p { color: ${colors.gray[600]}; margin: 0 0 ${spacing[6]} 0; font-size: ${typography.fontSize.sm}; line-height: ${typography.lineHeight.relaxed}; max-width: 480px; margin-left: auto; margin-right: auto; }
`;

// ============================================
// TYPES & HELPERS
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

// Build a slug → addon mapping from registry
function buildAddonSlugMap() {
  const map = new Map<string, typeof ADDONS_REGISTRY[0]>();
  for (const addon of ADDONS_REGISTRY) {
    for (const col of addon.collections) {
      map.set(col.slug, addon);
    }
  }
  return map;
}

const addonSlugMap = buildAddonSlugMap();

// ============================================
// COMPONENT
// ============================================

export const Collections = () => {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const handleDelete = async (e: React.MouseEvent, collection: Collection) => {
    e.stopPropagation();
    if (!confirm(`Delete "${collection.name}" and ALL its entries? This cannot be undone.`)) return;

    try {
      const { error } = await api.deleteCollection(collection.slug);
      if (error) throw new Error(error);
      setCollections(prev => prev.filter(c => c.id !== collection.id));
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  useEffect(() => {
    let active = true;

    async function fetchCollections() {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await api.getCollections();
        if (fetchError) throw new Error(fetchError);
        if (active) setCollections(data || []);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load collections');
      } finally {
        if (active) setLoading(false);
      }
    }

    if (user) {
      fetchCollections();
    } else {
      setLoading(false);
    }

    const timeout = setTimeout(() => { if (active) setLoading(false); }, 10000);
    return () => { active = false; clearTimeout(timeout); };
  }, [user?.id]);

  // ── Separate collections into addon groups and standalone ──
  const { addonGroups, standaloneCollections } = (() => {
    const grouped = new Map<string, { addon: typeof ADDONS_REGISTRY[0]; collections: Collection[] }>();
    const standalone: Collection[] = [];

    for (const col of collections) {
      const addon = addonSlugMap.get(col.slug);
      if (addon) {
        if (!grouped.has(addon.id)) {
          grouped.set(addon.id, { addon, collections: [] });
        }
        grouped.get(addon.id)!.collections.push(col);
      } else {
        standalone.push(col);
      }
    }

    return {
      addonGroups: Array.from(grouped.values()),
      standaloneCollections: standalone,
    };
  })();

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
          <h1>{t('collections.title')}</h1>
          <p>
            <strong>{user?.email}</strong> • Role: <strong>{profile?.role || 'viewer'}</strong>
          </p>
        </div>
        {isAdmin && (
          <NewCollectionButton onClick={() => navigate('/content/builder')}>
            <Plus />
            {t('collections.newCollection')}
          </NewCollectionButton>
        )}
      </Header>

      {collections.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <FileText />
          </div>
          <h3>{t('collections.noCollections')}</h3>
          <p>
            No content collections have been created yet. Install add-ons or create a collection to get started.
          </p>
        </EmptyState>
      ) : (
        <>
          {/* Add-on grouped cards */}
          {addonGroups.length > 0 && (
            <>
              <SectionLabel>Add-ons</SectionLabel>
              <Grid>
                {addonGroups.map(({ addon, collections: addonCols }) => {
                  const Icon = ADDON_ICON_MAP[addon.icon] || Package;
                  return (
                    <AddonCard key={addon.id} $color={addon.color}>
                      <AddonCardTop $color={addon.color} />
                      <AddonCardBody>
                        <AddonCardHeader>
                          <div
                            className="addon-icon"
                            style={{ background: addon.color + '15', color: addon.color }}
                          >
                            <Icon />
                          </div>
                          <div className="addon-info">
                            <div className="addon-name">{addon.name}</div>
                            <div className="addon-meta">
                              {addonCols.length} collection{addonCols.length !== 1 ? 's' : ''} • v{addon.version}
                            </div>
                          </div>
                        </AddonCardHeader>

                        <AddonCollectionList>
                          {addonCols.map(col => (
                            <AddonCollectionRow
                              key={col.id}
                              onClick={() => navigate(`/content/${col.slug}`)}
                            >
                              <div className="row-left">
                                <FileText size={16} style={{ color: colors.gray[400], flexShrink: 0 }} />
                                <div className="row-text">
                                  <div className="row-name">{col.name}</div>
                                  {col.description && (
                                    <div className="row-desc">{col.description}</div>
                                  )}
                                </div>
                              </div>
                              <div className="row-right">
                                {isAdmin && (
                                  <>
                                    <ActionBtn
                                      title="Edit collection"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/content/${col.slug}/edit-collection`);
                                      }}
                                    >
                                      <Pencil />
                                    </ActionBtn>
                                    <ActionBtn
                                      className="delete"
                                      title="Delete collection"
                                      onClick={(e) => handleDelete(e, col)}
                                    >
                                      <Trash2 />
                                    </ActionBtn>
                                  </>
                                )}
                                <ArrowRight className="row-arrow" />
                              </div>
                            </AddonCollectionRow>
                          ))}
                        </AddonCollectionList>
                      </AddonCardBody>
                    </AddonCard>
                  );
                })}
              </Grid>
            </>
          )}

          {/* Standalone collections */}
          {standaloneCollections.length > 0 && (
            <>
              {addonGroups.length > 0 && (
                <SectionLabel>Collections</SectionLabel>
              )}
              <Grid>
                {standaloneCollections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    $accentColor={collection.color || undefined}
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
            </>
          )}
        </>
      )}
    </Container>
  );
};
