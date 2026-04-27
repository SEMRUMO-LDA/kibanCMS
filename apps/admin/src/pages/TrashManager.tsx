/**
 * Trash Manager (v1.6)
 *
 * Lists soft-deleted entries with restore + hard-delete actions.
 * Auto-empties entries older than 30 days (worker handles it).
 */

import { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Trash2, RotateCcw, AlertTriangle, RefreshCw, Clock, X,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  max-width: 1100px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${spacing[6]};

  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[1]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
`;

const IconBtn = styled.button<{ $variant?: 'ghost' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${p => p.$variant === 'danger' ? colors.red[200] : colors.gray[200]};
  background: ${colors.white};
  color: ${p => p.$variant === 'danger' ? colors.red[600] : colors.gray[700]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  svg { width: 16px; height: 16px; }
  &:hover {
    background: ${p => p.$variant === 'danger' ? colors.red[50] : colors.gray[50]};
    border-color: ${p => p.$variant === 'danger' ? colors.red[300] : colors.gray[300]};
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const InfoBanner = styled.div`
  background: ${colors.yellow[50]};
  border: 1px solid ${colors.yellow[200]};
  color: ${colors.yellow[700]};
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[5]};
  font-size: ${typography.fontSize.sm};
  svg { flex-shrink: 0; width: 18px; height: 18px; }
`;

const TableWrapper = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th {
    text-align: left;
    padding: ${spacing[3]} ${spacing[4]};
    font-size: 12px;
    font-weight: 600;
    color: ${colors.gray[500]};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: ${colors.gray[50]};
    border-bottom: 1px solid ${colors.gray[200]};
  }
  td {
    padding: ${spacing[3]} ${spacing[4]};
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[700]};
    border-bottom: 1px solid ${colors.gray[100]};
    vertical-align: middle;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: ${colors.gray[50]}; }
`;

const DaysLeft = styled.span<{ $urgent: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: ${p => p.$urgent ? colors.red[50] : colors.gray[100]};
  color: ${p => p.$urgent ? colors.red[700] : colors.gray[600]};
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  svg { width: 12px; height: 12px; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[12]} ${spacing[4]};
  color: ${colors.gray[400]};
  svg { margin-bottom: ${spacing[3]}; }
  p:first-of-type { font-weight: 500; color: ${colors.gray[600]}; margin-bottom: ${spacing[1]}; }
  p { font-size: ${typography.fontSize.sm}; }
`;

export const TrashManager = () => {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    const { data, meta, error } = await api.getTrash({ limit: '200' });
    if (error) toast.error(error);
    setItems(data || []);
    if (meta?.retention_days) setRetentionDays(meta.retention_days);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const handleRestore = async (id: string) => {
    setActionId(id);
    const { error } = await api.restoreFromTrash(id);
    setActionId(null);
    if (error) { toast.error(error); return; }
    toast.success('Entry restored');
    fetchTrash();
  };

  const handleHardDelete = async (id: string, title: string) => {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    setActionId(id);
    const { error } = await api.hardDeleteEntry(id);
    setActionId(null);
    if (error) { toast.error(error); return; }
    toast.success('Entry permanently deleted');
    fetchTrash();
  };

  const handleEmptyExpired = async () => {
    if (!confirm(`Permanently delete all entries older than ${retentionDays} days? This cannot be undone.`)) return;
    const { data, error } = await api.emptyTrash();
    if (error) { toast.error(error); return; }
    toast.success(`Deleted ${data?.count || 0} expired entries`);
    fetchTrash();
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>Trash</h1>
          <p>Deleted entries are kept for {retentionDays} days, then permanently removed.</p>
        </div>
        <HeaderActions>
          <IconBtn onClick={fetchTrash}>
            <RefreshCw /> Refresh
          </IconBtn>
          {items.length > 0 && (
            <IconBtn $variant="danger" onClick={handleEmptyExpired}>
              <Trash2 /> Empty expired
            </IconBtn>
          )}
        </HeaderActions>
      </Header>

      {items.length > 0 && (
        <InfoBanner>
          <AlertTriangle />
          Entries here will be permanently removed after {retentionDays} days. Restore now to keep them.
        </InfoBanner>
      )}

      <TableWrapper>
        {items.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Collection</th>
                <th>Deleted</th>
                <th>Time left</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isActioning = actionId === item.id;
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: colors.gray[900] }}>{item.title || item.slug || '—'}</td>
                    <td>{item.collection?.name || <span style={{ color: colors.gray[400] }}>{item.collection_id?.slice(0, 8) || '—'}</span>}</td>
                    <td style={{ fontSize: 12, color: colors.gray[500] }}>
                      {item.deleted_at ? new Date(item.deleted_at).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <DaysLeft $urgent={item.days_left <= 3}>
                        <Clock />
                        {item.days_left} day{item.days_left !== 1 ? 's' : ''}
                      </DaysLeft>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <IconBtn onClick={() => handleRestore(item.id)} disabled={isActioning}>
                          <RotateCcw /> Restore
                        </IconBtn>
                        <IconBtn $variant="danger" onClick={() => handleHardDelete(item.id, item.title)} disabled={isActioning}>
                          <X /> Delete forever
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>
            <Trash2 size={48} />
            <p>{loading ? 'Loading trash…' : 'Trash is empty'}</p>
            <p>{!loading && 'Deleted entries will appear here for 30 days before permanent removal.'}</p>
          </EmptyState>
        )}
      </TableWrapper>
    </Container>
  );
};
