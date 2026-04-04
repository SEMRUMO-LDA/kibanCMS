/**
 * Activity Log Page
 * Visual timeline of all content changes — who did what, when.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import {
  Clock, Plus, Edit, Trash2, Eye, ArrowRight, Loader, User,
  FileText, Filter, ChevronLeft, ChevronRight,
} from 'lucide-react';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`max-width: 900px; animation: ${fadeIn} 0.3s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[6]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const Timeline = styled.div`position: relative; padding-left: 32px;
  &::before { content: ''; position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: ${colors.gray[200]}; }
`;

const TimelineItem = styled.div`
  position: relative; margin-bottom: ${spacing[4]}; cursor: pointer;

  .dot {
    position: absolute; left: -25px; top: 18px;
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid ${colors.white}; box-shadow: 0 0 0 2px ${colors.gray[200]};
    display: flex; align-items: center; justify-content: center;
    svg { width: 10px; height: 10px; }
  }

  .dot.created { background: #dcfce7; color: #16a34a; box-shadow: 0 0 0 2px #bbf7d0; }
  .dot.updated { background: #dbeafe; color: #2563eb; box-shadow: 0 0 0 2px #bfdbfe; }
  .dot.published { background: ${colors.accent[100]}; color: ${colors.accent[600]}; box-shadow: 0 0 0 2px ${colors.accent[200]}; }

  .card {
    background: ${colors.white}; border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.lg}; padding: ${spacing[4]} ${spacing[5]};
    transition: all 0.15s;
    &:hover { border-color: ${colors.accent[300]}; box-shadow: ${shadows.md}; }
  }

  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: ${spacing[2]}; }

  .action-text { font-size: ${typography.fontSize.sm}; color: ${colors.gray[900]};
    strong { font-weight: 600; }
    .entry-link { color: ${colors.accent[600]}; font-weight: 500; }
    .collection { color: ${colors.gray[500]}; }
  }

  .time { font-size: 12px; color: ${colors.gray[400]}; white-space: nowrap; }

  .card-meta {
    display: flex; align-items: center; gap: ${spacing[3]}; font-size: 12px; color: ${colors.gray[500]};
    .badge { padding: 2px 8px; border-radius: 99px; font-weight: 600; font-size: 11px; }
    .badge.published { background: #dcfce7; color: #166534; }
    .badge.draft { background: ${colors.gray[100]}; color: ${colors.gray[600]}; }
    .badge.review { background: #fef3c7; color: #92400e; }
    .badge.archived { background: ${colors.gray[200]}; color: ${colors.gray[600]}; }
  }
`;

const Pagination = styled.div`
  display: flex; justify-content: center; align-items: center; gap: ${spacing[3]};
  padding: ${spacing[6]} 0;
  button {
    padding: ${spacing[2]} ${spacing[3]}; background: ${colors.white};
    border: 1px solid ${colors.gray[300]}; border-radius: ${borders.radius.md};
    cursor: pointer; display: flex; align-items: center; gap: ${spacing[1]};
    font-size: ${typography.fontSize.sm}; font-family: ${typography.fontFamily.sans};
    &:hover { background: ${colors.gray[50]}; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
    svg { width: 16px; height: 16px; }
  }
  span { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; }
`;

const EmptyState = styled.div`
  text-align: center; padding: ${spacing[12]}; color: ${colors.gray[400]};
  svg { margin-bottom: ${spacing[3]}; }
  p { font-size: ${typography.fontSize.sm}; }
`;

const PAGE_SIZE = 30;

export const ActivityLog = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    loadActivity();
  }, [page]);

  const loadActivity = async () => {
    setLoading(true);
    const { data, meta, error } = await api.getActivity({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });

    if (!error) {
      setItems(data || []);
      setTotal(meta?.pagination?.total || 0);
    }
    setLoading(false);
  };

  const timeAgo = (ts: string) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Container>
      <Header>
        <h1>{t('activity.title')}</h1>
        <p>{total} total events • Page {page + 1} of {totalPages || 1}</p>
      </Header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : items.length === 0 ? (
        <EmptyState>
          <Clock size={48} />
          <p>{t('activity.noActivity')}</p>
        </EmptyState>
      ) : (
        <Timeline>
          {items.map(item => {
            const authorName = item.author?.full_name || item.author?.email?.split('@')[0] || 'Unknown';
            return (
              <TimelineItem
                key={item.id + item.updated_at}
                onClick={() => navigate(`/content/${item.collection_slug}/edit/${item.id}`)}
              >
                <div className={`dot ${item.action}`}>
                  {item.action === 'created' ? <Plus /> : <Edit />}
                </div>
                <div className="card">
                  <div className="card-top">
                    <div className="action-text">
                      <strong>{authorName}</strong>{' '}
                      {item.action === 'created' ? t('activity.created') : t('activity.updated')}{' '}
                      <span className="entry-link">{item.entry_title}</span>{' '}
                      <span className="collection">{t('activity.in')} {item.collection_name}</span>
                    </div>
                    <span className="time">{timeAgo(item.updated_at)}</span>
                  </div>
                  <div className="card-meta">
                    <span className={`badge ${item.entry_status}`}>{item.entry_status}</span>
                    <span>{new Date(item.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </TimelineItem>
            );
          })}
        </Timeline>
      )}

      {totalPages > 1 && (
        <Pagination>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0}>
            <ChevronLeft /> Previous
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
            Next <ChevronRight />
          </button>
        </Pagination>
      )}
    </Container>
  );
};
