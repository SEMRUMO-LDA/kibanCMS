import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../features/auth/hooks/useAuth';
import {
  FileText, Users, Image as ImageIcon, Box, TrendingUp, Activity,
  Clock, Edit, Plus, Upload, Wand2, ArrowRight, Key, CheckCircle,
  AlertCircle, CalendarClock, Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const PageHeader = styled.header`
  margin-bottom: ${spacing[6]};
  animation: ${fadeIn} 0.4s ease-out;
  h1 {
    font-size: ${typography.fontSize['4xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[1]} 0;
    color: ${colors.gray[900]};
  }
  p {
    color: ${colors.gray[500]};
    font-size: ${typography.fontSize.sm};
    margin: 0;
    b { color: ${colors.gray[700]}; font-weight: 600; }
  }
`;

const QuickActionsBar = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[8]};
  flex-wrap: wrap;
  animation: ${fadeIn} 0.4s ease-out 50ms backwards;
`;

const QuickAction = styled.button<{ $accent?: string }>`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]} ${spacing[5]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
  min-width: 180px;
  font-family: ${typography.fontFamily.sans};

  &:hover {
    border-color: ${props => props.$accent || colors.accent[300]};
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .qa-icon {
    width: 44px; height: 44px;
    border-radius: ${borders.radius.lg};
    background: ${props => props.$accent ? props.$accent + '15' : colors.accent[50]};
    color: ${props => props.$accent || colors.accent[600]};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    svg { width: 22px; height: 22px; }
  }

  .qa-text {
    text-align: left;
    .qa-title { font-size: ${typography.fontSize.sm}; font-weight: 600; color: ${colors.gray[900]}; }
    .qa-desc { font-size: 12px; color: ${colors.gray[500]}; margin-top: 2px; }
  }
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${spacing[5]};
  margin-bottom: ${spacing[8]};
  animation: ${fadeIn} 0.4s ease-out 100ms backwards;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const Grid4 = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${spacing[4]};
  margin-bottom: ${spacing[8]};
  animation: ${fadeIn} 0.4s ease-out 100ms backwards;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
`;

const StatCard = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[5]};
  transition: all 0.2s;
  cursor: pointer;
  &:hover { border-color: ${colors.accent[300]}; box-shadow: ${shadows.md}; transform: translateY(-1px); }

  .stat-label { font-size: 12px; font-weight: 600; color: ${colors.gray[500]}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: ${spacing[2]}; }
  .stat-value { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; color: ${colors.gray[900]}; }
  .stat-footer { display: flex; align-items: center; gap: ${spacing[2]}; margin-top: ${spacing[2]}; font-size: 12px; color: ${colors.gray[500]}; svg { width: 14px; height: 14px; } }
`;

const Card = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const CardHeader = styled.div`
  padding: ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[100]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 { margin: 0; font-size: ${typography.fontSize.base}; font-weight: 600; color: ${colors.gray[900]}; }
  a, button {
    font-size: 13px; color: ${colors.accent[600]}; background: none; border: none;
    cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 4px;
    text-decoration: none; font-family: ${typography.fontFamily.sans};
    &:hover { color: ${colors.accent[700]}; }
  }
`;

const ListItem = styled.div`
  padding: ${spacing[3]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[50]};
  display: flex; align-items: center; gap: ${spacing[3]};
  cursor: pointer;
  transition: background 0.1s;
  &:last-child { border-bottom: none; }
  &:hover { background: ${colors.gray[50]}; }

  .li-icon { width: 36px; height: 36px; border-radius: ${borders.radius.md}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; svg { width: 18px; height: 18px; } }
  .li-content { flex: 1; min-width: 0; }
  .li-title { font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[900]}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .li-meta { font-size: 12px; color: ${colors.gray[500]}; display: flex; gap: ${spacing[2]}; margin-top: 2px; }
  .li-badge { padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .li-time { font-size: 12px; color: ${colors.gray[400]}; flex-shrink: 0; }
`;

const CollectionBar = styled.div`
  padding: ${spacing[3]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[50]};
  display: flex; align-items: center; gap: ${spacing[3]};
  cursor: pointer;
  &:last-child { border-bottom: none; }
  &:hover { background: ${colors.gray[50]}; }

  .cb-name { flex: 1; font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[900]}; }
  .cb-count { font-size: ${typography.fontSize.sm}; font-weight: 600; color: ${colors.gray[700]}; min-width: 40px; text-align: right; }
  .cb-bar { flex: 2; height: 8px; background: ${colors.gray[100]}; border-radius: 99px; overflow: hidden; }
  .cb-fill { height: 100%; background: ${colors.accent[400]}; border-radius: 99px; transition: width 0.5s ease-out; }
`;

const HealthGrid = styled.div`
  padding: ${spacing[4]} ${spacing[5]};
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${spacing[4]};
  @media (max-width: 640px) { grid-template-columns: 1fr; }

  .health-item {
    display: flex; align-items: center; gap: ${spacing[2]};
    font-size: 13px; color: ${colors.gray[700]};
    svg { width: 16px; height: 16px; }
    .ok { color: #16a34a; }
    .warn { color: #d97706; }
  }
`;

const EmptyList = styled.div`
  padding: ${spacing[8]} ${spacing[4]};
  text-align: center;
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[400]};
`;

const LoadingSkeleton = styled.div`
  background: linear-gradient(90deg, ${colors.gray[200]} 0%, ${colors.gray[100]} 50%, ${colors.gray[200]} 100%);
  background-size: 200% 100%;
  animation: ${shimmer} 2s infinite linear;
  border-radius: ${borders.radius.md};
  &.h32 { height: 32px; width: 80px; }
`;

// ============================================
// TYPES
// ============================================

interface CollectionStat { name: string; slug: string; count: number; }
interface DraftEntry { id: string; title: string; slug: string; collection_slug: string; updated_at: string; }
interface ScheduledEntry { id: string; title: string; collection_slug: string; published_at: string; }

// ============================================
// COMPONENT
// ============================================

export const Dashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ entries: 0, collections: 0, media: 0, users: 0 });
  const [collectionStats, setCollectionStats] = useState<CollectionStat[]>([]);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledEntry[]>([]);
  const [apiKeyCount, setApiKeyCount] = useState(0);
  const [activity, setActivity] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => { setLoading(false); setFetchError(true); }, 10000);
    fetchAll().finally(() => clearTimeout(timeout));
    return () => clearTimeout(timeout);
  }, []);

  // Safe query helper — never throws, returns null on error
  const q = async <T,>(promise: PromiseLike<{ data: T; error: any; count?: number | null }>): Promise<{ data: T | null; count: number }> => {
    try {
      const res = await promise;
      if (res.error) { console.warn('[Dashboard] Query error:', res.error.message); return { data: null, count: 0 }; }
      return { data: res.data, count: (res as any).count || 0 };
    } catch { return { data: null, count: 0 }; }
  };

  const fetchAll = async () => {
    try {
      // Every query is independent — one failure does NOT kill the others
      const [entriesR, collectionsR, mediaR, usersR, colsR, draftsR, scheduledR, keysR, recentR] = await Promise.all([
        q(supabase.from('entries').select('id', { count: 'exact', head: true })),
        q(supabase.from('collections').select('id', { count: 'exact', head: true })),
        q(supabase.from('media').select('id', { count: 'exact', head: true })),
        q(supabase.from('profiles').select('id', { count: 'exact', head: true })),
        q(supabase.from('collections').select('id, name, slug')),
        q(supabase.from('entries').select('id, title, slug, collection_id, updated_at').eq('status', 'draft').order('updated_at', { ascending: false }).limit(5)),
        q(supabase.from('entries').select('id, title, collection_id, published_at').eq('status', 'scheduled').order('published_at', { ascending: true }).limit(5)),
        q(supabase.from('api_keys').select('id', { count: 'exact', head: true }).is('revoked_at', null)),
        q(supabase.from('entries').select('id, title, status, created_at, updated_at, author_id').order('updated_at', { ascending: false }).limit(8)),
      ]);

      setMetrics({
        entries: entriesR.count,
        collections: collectionsR.count,
        media: mediaR.count,
        users: usersR.count,
      });

      setApiKeyCount(keysR.count);

      // Collection stats — single extra query, grouped client-side
      const cols = colsR.data as any[] || [];
      if (cols.length > 0) {
        const { data: allEntries } = await q(supabase.from('entries').select('collection_id'));
        const countMap = new Map<string, number>();
        ((allEntries as any[]) || []).forEach((e: any) => {
          countMap.set(e.collection_id, (countMap.get(e.collection_id) || 0) + 1);
        });
        const stats: CollectionStat[] = cols.map((col: any) => ({
          name: col.name, slug: col.slug, count: countMap.get(col.id) || 0,
        }));
        stats.sort((a, b) => b.count - a.count);
        setCollectionStats(stats);
      }

      // Map drafts + scheduled with collection slugs
      const colMap = new Map((cols as any[]).map((c: any) => [c.id, c.slug]));

      if (draftsR.data) {
        setDrafts((draftsR.data as any[]).map((d: any) => ({
          ...d, collection_slug: colMap.get(d.collection_id) || '',
        })));
      }

      if (scheduledR.data) {
        setScheduled((scheduledR.data as any[]).map((s: any) => ({
          ...s, collection_slug: colMap.get(s.collection_id) || '',
        })));
      }

      setActivity((recentR.data as any[]) || []);
      setFetchError(false);
    } catch (err) {
      console.error('[Dashboard]', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  const timeAgo = (ts: string) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const maxCount = Math.max(...collectionStats.map(c => c.count), 1);

  return (
    <>
      {/* Connection error banner */}
      {fetchError && (
        <div style={{
          padding: '12px 16px', marginBottom: spacing[5],
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: borders.radius.lg,
          fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertCircle size={16} />
          Some data may be incomplete — connection was slow. <button onClick={() => { setFetchError(false); setLoading(true); fetchAll(); }} style={{ background: 'none', border: 'none', color: '#92400e', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>Retry</button>
        </div>
      )}

      {/* Header */}
      <PageHeader>
        <h1>{getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Admin'}</h1>
        <p>Here's what's happening with your content • <b>{user?.email}</b></p>
      </PageHeader>

      {/* Quick Actions */}
      <QuickActionsBar>
        <QuickAction onClick={() => navigate('/content')}>
          <div className="qa-icon"><Plus /></div>
          <div className="qa-text">
            <div className="qa-title">New Entry</div>
            <div className="qa-desc">Create content</div>
          </div>
        </QuickAction>
        <QuickAction onClick={() => navigate('/media')} $accent="#2563eb">
          <div className="qa-icon"><Upload /></div>
          <div className="qa-text">
            <div className="qa-title">Upload Media</div>
            <div className="qa-desc">Images & files</div>
          </div>
        </QuickAction>
        <QuickAction onClick={() => navigate('/content/builder')} $accent="#7c3aed">
          <div className="qa-icon"><Wand2 /></div>
          <div className="qa-text">
            <div className="qa-title">New Collection</div>
            <div className="qa-desc">AI or manual</div>
          </div>
        </QuickAction>
        <QuickAction onClick={() => navigate('/settings')} $accent="#d97706">
          <div className="qa-icon"><Key /></div>
          <div className="qa-text">
            <div className="qa-title">API Keys</div>
            <div className="qa-desc">Integration setup</div>
          </div>
        </QuickAction>
      </QuickActionsBar>

      {/* Metrics */}
      <Grid4>
        <StatCard onClick={() => navigate('/content')}>
          <div className="stat-label">Entries</div>
          {loading ? <LoadingSkeleton className="h32" /> : <div className="stat-value">{fmt(metrics.entries)}</div>}
          <div className="stat-footer"><FileText /> Content items</div>
        </StatCard>
        <StatCard onClick={() => navigate('/content')}>
          <div className="stat-label">Collections</div>
          {loading ? <LoadingSkeleton className="h32" /> : <div className="stat-value">{fmt(metrics.collections)}</div>}
          <div className="stat-footer"><Box /> Schemas</div>
        </StatCard>
        <StatCard onClick={() => navigate('/media')}>
          <div className="stat-label">Media</div>
          {loading ? <LoadingSkeleton className="h32" /> : <div className="stat-value">{fmt(metrics.media)}</div>}
          <div className="stat-footer"><ImageIcon /> Files uploaded</div>
        </StatCard>
        <StatCard onClick={() => navigate('/users')}>
          <div className="stat-label">Team</div>
          {loading ? <LoadingSkeleton className="h32" /> : <div className="stat-value">{fmt(metrics.users)}</div>}
          <div className="stat-footer"><Users /> Members</div>
        </StatCard>
      </Grid4>

      {/* Two-column layout: Drafts + Activity | Collections breakdown + Scheduled + Health */}
      <Grid2>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5] }}>
          {/* Drafts */}
          <Card>
            <CardHeader>
              <h3>Recent Drafts</h3>
              <button onClick={() => navigate('/content')}>View all <ArrowRight size={14} /></button>
            </CardHeader>
            {drafts.length === 0 ? (
              <EmptyList>No drafts — all content is published</EmptyList>
            ) : (
              drafts.map(d => (
                <ListItem key={d.id} onClick={() => navigate(`/content/${d.collection_slug}/edit/${d.id}`)}>
                  <div className="li-icon" style={{ background: colors.gray[100], color: colors.gray[500] }}><Pencil /></div>
                  <div className="li-content">
                    <div className="li-title">{d.title || 'Untitled'}</div>
                    <div className="li-meta"><span>{d.collection_slug}</span></div>
                  </div>
                  <span className="li-time">{timeAgo(d.updated_at)}</span>
                </ListItem>
              ))
            )}
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <h3>Recent Activity</h3>
              <button onClick={() => navigate('/content')}>View all <ArrowRight size={14} /></button>
            </CardHeader>
            {activity.length === 0 ? (
              <EmptyList>No activity yet</EmptyList>
            ) : (
              activity.map(entry => {
                const isNew = new Date(entry.created_at).getTime() === new Date(entry.updated_at).getTime();
                return (
                  <ListItem key={entry.id} onClick={() => navigate('/content')}>
                    <div className="li-icon" style={{
                      background: isNew ? colors.accent[50] : '#dbeafe',
                      color: isNew ? colors.accent[600] : '#2563eb',
                    }}>
                      {isNew ? <Plus /> : <Edit />}
                    </div>
                    <div className="li-content">
                      <div className="li-title">{entry.title || 'Untitled'}</div>
                      <div className="li-meta">
                        <span className="li-badge" style={{
                          background: entry.status === 'published' ? '#dcfce7' : colors.gray[100],
                          color: entry.status === 'published' ? '#166534' : colors.gray[600],
                        }}>{entry.status}</span>
                      </div>
                    </div>
                    <span className="li-time">{timeAgo(entry.updated_at)}</span>
                  </ListItem>
                );
              })
            )}
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5] }}>
          {/* Entries per Collection */}
          <Card>
            <CardHeader>
              <h3>Entries by Collection</h3>
            </CardHeader>
            {collectionStats.length === 0 ? (
              <EmptyList>No collections yet</EmptyList>
            ) : (
              collectionStats.map(c => (
                <CollectionBar key={c.slug} onClick={() => navigate(`/content/${c.slug}`)}>
                  <span className="cb-name">{c.name}</span>
                  <span className="cb-count">{c.count}</span>
                  <div className="cb-bar">
                    <div className="cb-fill" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                  </div>
                </CollectionBar>
              ))
            )}
          </Card>

          {/* Scheduled Content */}
          <Card>
            <CardHeader>
              <h3>Scheduled</h3>
            </CardHeader>
            {scheduled.length === 0 ? (
              <EmptyList>No scheduled content</EmptyList>
            ) : (
              scheduled.map(s => (
                <ListItem key={s.id} onClick={() => navigate(`/content/${s.collection_slug}/edit/${s.id}`)}>
                  <div className="li-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><CalendarClock /></div>
                  <div className="li-content">
                    <div className="li-title">{s.title || 'Untitled'}</div>
                    <div className="li-meta"><span>{s.collection_slug}</span></div>
                  </div>
                  <span className="li-time">{new Date(s.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </ListItem>
              ))
            )}
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <h3>System Status</h3>
            </CardHeader>
            <HealthGrid>
              <div className="health-item">
                <CheckCircle className="ok" />
                Database connected
              </div>
              <div className="health-item">
                <CheckCircle className="ok" />
                {apiKeyCount} API key{apiKeyCount !== 1 ? 's' : ''} active
              </div>
              <div className="health-item">
                {metrics.collections > 0
                  ? <><CheckCircle className="ok" />{metrics.collections} collections</>
                  : <><AlertCircle className="warn" />No collections</>
                }
              </div>
            </HealthGrid>
          </Card>
        </div>
      </Grid2>
    </>
  );
};
