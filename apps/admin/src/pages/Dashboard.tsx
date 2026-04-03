import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../features/auth/hooks/useAuth';
import { FileText, Users, Image as ImageIcon, Box, TrendingUp, Activity, Clock, Edit, Plus } from 'lucide-react';
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

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const PageHeader = styled.header`
  margin-bottom: ${spacing[8]};
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};

  h1 {
    font-size: ${typography.fontSize['4xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[2]} 0;
    letter-spacing: ${typography.letterSpacing.tighter};
    color: ${colors.gray[900]};
    line-height: ${typography.lineHeight.tight};
  }

  p {
    color: ${colors.gray[600]};
    font-size: ${typography.fontSize.base};
    margin: 0;
    line-height: ${typography.lineHeight.normal};

    b {
      color: ${colors.gray[800]};
      font-weight: ${typography.fontWeight.semibold};
    }
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: ${spacing[6]};
  margin-bottom: ${spacing[10]};
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out} 100ms backwards;
`;

const StatCard = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
  transition: all ${animations.duration.normal} ${animations.easing.out};
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: ${colors.accent[300]};
    box-shadow: ${shadows.lg};
    transform: translateY(-2px);

    .stat-icon {
      transform: scale(1.05);
      background: linear-gradient(135deg, ${colors.accent[400]}, ${colors.accent[600]});
    }
  }

  /* Subtle gradient overlay on hover */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, ${colors.accent[400]}, ${colors.accent[600]});
    opacity: 0;
    transition: opacity ${animations.duration.normal};
  }

  &:hover::before {
    opacity: 1;
  }
`;

const StatHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${spacing[4]};
`;

const StatIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: ${borders.radius.lg};
  background: ${colors.gray[100]};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.gray[700]};
  flex-shrink: 0;
  transition: all ${animations.duration.normal} ${animations.easing.out};

  svg {
    width: 24px;
    height: 24px;
  }
`;

const StatMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[1]};
  flex: 1;
  min-width: 0;
`;

const StatLabel = styled.div`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[600]};
  text-transform: uppercase;
  letter-spacing: ${typography.letterSpacing.wide};
`;

const StatValue = styled.div`
  font-size: ${typography.fontSize['3xl']};
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.gray[900]};
  line-height: ${typography.lineHeight.tight};
  letter-spacing: ${typography.letterSpacing.tight};
`;

const StatTrend = styled.div<{ $positive?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[1]};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  color: ${props => props.$positive ? colors.accent[600] : colors.gray[500]};

  svg {
    width: 14px;
    height: 14px;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing[6]};
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out} 200ms backwards;

  h2 {
    font-size: ${typography.fontSize['2xl']};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0;
    letter-spacing: ${typography.letterSpacing.tight};
  }

  .section-actions {
    display: flex;
    gap: ${spacing[2]};
  }
`;

const EmptyState = styled.div`
  background: ${colors.white};
  border: 1px dashed ${colors.gray[300]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[12]} ${spacing[8]};
  text-align: center;
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out} 300ms backwards;

  .empty-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto ${spacing[4]};
    border-radius: ${borders.radius.full};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[400]};

    svg {
      width: 32px;
      height: 32px;
    }
  }

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[2]} 0;
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;
    line-height: ${typography.lineHeight.relaxed};
    max-width: 400px;
    margin: 0 auto;
  }
`;

const ActivityFeed = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out} 300ms backwards;
`;

const ActivityItem = styled.div`
  padding: ${spacing[4]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[100]};
  display: flex;
  align-items: center;
  gap: ${spacing[4]};
  cursor: pointer;
  transition: background ${animations.duration.fast} ${animations.easing.out};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${colors.gray[50]};
  }

  .activity-icon {
    width: 40px;
    height: 40px;
    border-radius: ${borders.radius.full};
    background: ${colors.accent[50]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.accent[600]};
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }

    &.media {
      background: #dbeafe;
      color: #2563eb;
    }
  }

  .activity-content {
    flex: 1;
    min-width: 0;

    .activity-text {
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[900]};
      margin: 0 0 ${spacing[1]} 0;
      line-height: ${typography.lineHeight.relaxed};

      strong {
        font-weight: ${typography.fontWeight.semibold};
        color: ${colors.gray[900]};
      }

      .entry-title {
        color: ${colors.accent[600]};
        font-weight: ${typography.fontWeight.medium};
      }
    }

    .activity-time {
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[500]};
    }
  }
`;

const LoadingSkeleton = styled.div`
  background: ${colors.gray[200]};
  background: linear-gradient(
    90deg,
    ${colors.gray[200]} 0%,
    ${colors.gray[100]} 50%,
    ${colors.gray[200]} 100%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 2s infinite linear;
  border-radius: ${borders.radius.md};
  height: 24px;
  width: 100%;

  &.stat-value {
    height: 48px;
    width: 120px;
    margin-bottom: ${spacing[2]};
  }

  &.stat-label {
    height: 16px;
    width: 80px;
  }
`;

const QuickActions = styled.div`
  display: flex;
  gap: ${spacing[3]};
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  padding: ${spacing[2]} ${spacing[4]};
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
    color: ${colors.gray[900]};
  }

  &:active {
    transform: scale(0.98);
  }

  &.primary {
    background: ${colors.accent[500]};
    border-color: ${colors.accent[500]};
    color: ${colors.white};

    &:hover {
      background: ${colors.accent[600]};
      border-color: ${colors.accent[600]};
    }
  }
`;

// ============================================
// COMPONENT
// ============================================

interface Metrics {
  entries: number;
  collections: number;
  media: number;
  users: number;
}

interface ActivityItem {
  id: string;
  type: 'entry_created' | 'entry_updated' | 'media_uploaded';
  title: string;
  user_name: string;
  collection_slug?: string;
  timestamp: string;
}

export const Dashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics>({
    entries: 0,
    collections: 0,
    media: 0,
    users: 0,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const [entriesReq, collectionsReq, mediaReq, usersReq] = await Promise.all([
          supabase.from('entries').select('id', { count: 'exact', head: true }),
          supabase.from('collections').select('id', { count: 'exact', head: true }),
          supabase.from('media').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true })
        ]);

        setMetrics({
          entries: entriesReq.count || 0,
          collections: collectionsReq.count || 0,
          media: mediaReq.count || 0,
          users: usersReq.count || 0,
        });
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  useEffect(() => {
    async function fetchActivity() {
      try {
        setActivityLoading(true);

        const activityItems: ActivityItem[] = [];

        // Get recent entries (simplified - no joins)
        const { data: entries, error: entriesError } = await supabase
          .from('entries')
          .select('id, title, created_at, updated_at, author_id')
          .order('updated_at', { ascending: false })
          .limit(10);

        if (entriesError) {
          console.error('Error fetching entries:', entriesError);
        }

        // Get recent media uploads (simplified - no joins)
        const { data: media, error: mediaError } = await supabase
          .from('media')
          .select('id, filename, created_at, uploaded_by')
          .order('created_at', { ascending: false })
          .limit(5);

        if (mediaError) {
          console.error('Error fetching media:', mediaError);
        }

        // Get user info for activity
        const userIds = new Set<string>();
        entries?.forEach(e => e.author_id && userIds.add(e.author_id));
        media?.forEach(m => m.uploaded_by && userIds.add(m.uploaded_by));

        let profileMap = new Map();

        // Only fetch profiles if we have user IDs
        if (userIds.size > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', Array.from(userIds));

          if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
          }

          profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        }

        // Process entries
        if (entries) {
          entries.forEach(entry => {
            const isNew = new Date(entry.created_at).getTime() === new Date(entry.updated_at).getTime();
            const profile = profileMap.get(entry.author_id);

            activityItems.push({
              id: entry.id,
              type: isNew ? 'entry_created' : 'entry_updated',
              title: entry.title || 'Untitled',
              user_name: profile?.full_name || profile?.email?.split('@')[0] || 'Unknown',
              timestamp: entry.updated_at
            });
          });
        }

        // Process media
        if (media) {
          media.forEach(item => {
            const profile = profileMap.get(item.uploaded_by);

            activityItems.push({
              id: item.id,
              type: 'media_uploaded',
              title: item.filename,
              user_name: profile?.full_name || profile?.email?.split('@')[0] || 'Unknown',
              timestamp: item.created_at
            });
          });
        }

        // Sort by timestamp and take top 10
        activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivity(activityItems.slice(0, 10));

      } catch (error) {
        console.error('Error fetching activity:', error);
      } finally {
        setActivityLoading(false);
      }
    }

    fetchActivity();
  }, []);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityIcon = (type: string) => {
    if (type === 'entry_created') return <Plus />;
    if (type === 'entry_updated') return <Edit />;
    return <ImageIcon />;
  };

  const getActivityText = (item: ActivityItem) => {
    if (item.type === 'entry_created') {
      return (
        <>
          <strong>{item.user_name}</strong> created <span className="entry-title">{item.title}</span>
        </>
      );
    }
    if (item.type === 'entry_updated') {
      return (
        <>
          <strong>{item.user_name}</strong> updated <span className="entry-title">{item.title}</span>
        </>
      );
    }
    return (
      <>
        <strong>{item.user_name}</strong> uploaded <span className="entry-title">{item.title}</span>
      </>
    );
  };

  const handleActivityClick = (item: ActivityItem) => {
    if (item.type === 'media_uploaded') {
      navigate('/media');
    } else {
      navigate('/content');
    }
  };

  return (
    <>
      <PageHeader>
        <h1>{getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Admin'}</h1>
        <p>
          Here's what's happening with your content today •
          <b> {user?.email}</b>
        </p>
      </PageHeader>

      <StatsGrid>
        <StatCard>
          <StatHeader>
            <StatMeta>
              <StatLabel>Total Entries</StatLabel>
              {loading ? (
                <>
                  <LoadingSkeleton className="stat-value" />
                  <LoadingSkeleton className="stat-label" />
                </>
              ) : (
                <>
                  <StatValue>{formatNumber(metrics.entries)}</StatValue>
                  <StatTrend $positive>
                    <TrendingUp />
                    <span>Active</span>
                  </StatTrend>
                </>
              )}
            </StatMeta>
            <StatIcon className="stat-icon">
              <FileText />
            </StatIcon>
          </StatHeader>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatMeta>
              <StatLabel>Collections</StatLabel>
              {loading ? (
                <>
                  <LoadingSkeleton className="stat-value" />
                  <LoadingSkeleton className="stat-label" />
                </>
              ) : (
                <>
                  <StatValue>{formatNumber(metrics.collections)}</StatValue>
                  <StatTrend>
                    <Activity />
                    <span>Configured</span>
                  </StatTrend>
                </>
              )}
            </StatMeta>
            <StatIcon className="stat-icon">
              <Box />
            </StatIcon>
          </StatHeader>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatMeta>
              <StatLabel>Media Assets</StatLabel>
              {loading ? (
                <>
                  <LoadingSkeleton className="stat-value" />
                  <LoadingSkeleton className="stat-label" />
                </>
              ) : (
                <>
                  <StatValue>{formatNumber(metrics.media)}</StatValue>
                  <StatTrend $positive>
                    <TrendingUp />
                    <span>Growing</span>
                  </StatTrend>
                </>
              )}
            </StatMeta>
            <StatIcon className="stat-icon">
              <ImageIcon />
            </StatIcon>
          </StatHeader>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatMeta>
              <StatLabel>Team Members</StatLabel>
              {loading ? (
                <>
                  <LoadingSkeleton className="stat-value" />
                  <LoadingSkeleton className="stat-label" />
                </>
              ) : (
                <>
                  <StatValue>{formatNumber(metrics.users)}</StatValue>
                  <StatTrend>
                    <Users />
                    <span>Collaborating</span>
                  </StatTrend>
                </>
              )}
            </StatMeta>
            <StatIcon className="stat-icon">
              <Users />
            </StatIcon>
          </StatHeader>
        </StatCard>
      </StatsGrid>

      <SectionHeader>
        <h2>Recent Activity</h2>
        <QuickActions>
          <ActionButton onClick={() => navigate('/content')}>View All</ActionButton>
          <ActionButton className="primary" onClick={() => navigate('/content')}>Create New</ActionButton>
        </QuickActions>
      </SectionHeader>

      {activityLoading ? (
        <div style={{ padding: spacing[8], textAlign: 'center' }}>
          <LoadingSkeleton className="stat-value" style={{ margin: '0 auto' }} />
        </div>
      ) : activity.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <Clock />
          </div>
          <h3>No recent activity</h3>
          <p>
            When team members create or update content, you'll see it here.
            Start by creating your first entry.
          </p>
        </EmptyState>
      ) : (
        <ActivityFeed>
          {activity.map((item) => (
            <ActivityItem key={item.id} onClick={() => handleActivityClick(item)}>
              <div className={`activity-icon ${item.type === 'media_uploaded' ? 'media' : ''}`}>
                {getActivityIcon(item.type)}
              </div>
              <div className="activity-content">
                <p className="activity-text">{getActivityText(item)}</p>
                <div className="activity-time">{getTimeAgo(item.timestamp)}</div>
              </div>
            </ActivityItem>
          ))}
        </ActivityFeed>
      )}
    </>
  );
};
