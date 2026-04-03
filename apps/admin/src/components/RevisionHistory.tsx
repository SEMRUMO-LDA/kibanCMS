/**
 * Revision History Panel
 * Shows version history for an entry with ability to view and restore.
 */

import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { X, Clock, RotateCcw, Eye, Loader, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(2px);
  z-index: 9998;
  animation: ${fadeIn} 0.15s;
`;

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 480px;
  background: ${colors.white};
  box-shadow: ${shadows['2xl']};
  z-index: 9999;
  display: flex;
  flex-direction: column;
  animation: ${slideIn} 0.25s ease-out;
`;

const Header = styled.div`
  padding: ${spacing[5]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    display: flex;
    align-items: center;
    gap: ${spacing[2]};
  }

  button {
    background: none;
    border: none;
    cursor: pointer;
    color: ${colors.gray[400]};
    padding: ${spacing[2]};
    border-radius: ${borders.radius.md};
    &:hover { background: ${colors.gray[100]}; color: ${colors.gray[600]}; }
  }
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[3]};
`;

const RevisionItem = styled.div<{ $active?: boolean }>`
  padding: ${spacing[4]};
  margin-bottom: ${spacing[2]};
  border-radius: ${borders.radius.lg};
  border: 1px solid ${props => props.$active ? colors.accent[300] : colors.gray[200]};
  background: ${props => props.$active ? colors.accent[50] : colors.white};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${colors.accent[300]};
    background: ${colors.gray[50]};
  }

  .revision-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: ${spacing[2]};
  }

  .version {
    font-weight: ${typography.fontWeight.semibold};
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[900]};
    display: flex;
    align-items: center;
    gap: ${spacing[2]};
  }

  .version-badge {
    padding: 2px 8px;
    background: ${colors.gray[100]};
    border-radius: ${borders.radius.full};
    font-size: 11px;
    font-weight: 600;
    color: ${colors.gray[600]};
  }

  .date {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
  }

  .title {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[1]};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    gap: ${spacing[2]};
    margin-top: ${spacing[3]};
  }
`;

const ActionBtn = styled.button`
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[700]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;

  &:hover { background: ${colors.gray[50]}; }
  &.restore {
    background: ${colors.accent[500]}; border-color: ${colors.accent[500]};
    color: #fff;
    &:hover { background: ${colors.accent[600]}; }
  }

  svg { width: 13px; height: 13px; }
`;

const EmptyState = styled.div`
  padding: ${spacing[10]};
  text-align: center;
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};

  svg { margin-bottom: ${spacing[3]}; color: ${colors.gray[300]}; }
`;

const PreviewPanel = styled.div`
  padding: ${spacing[5]};
  border-top: 1px solid ${colors.gray[200]};
  background: ${colors.gray[50]};
  max-height: 40%;
  overflow-y: auto;

  h4 {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[3]};
    color: ${colors.gray[700]};
  }

  pre {
    font-size: 12px;
    font-family: ${typography.fontFamily.mono};
    background: ${colors.white};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.md};
    padding: ${spacing[3]};
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: ${colors.gray[700]};
    max-height: 200px;
    overflow-y: auto;
  }
`;

interface Revision {
  id: string;
  version: number;
  title: string;
  content: any;
  excerpt: string | null;
  revised_by: string;
  created_at: string;
}

interface RevisionHistoryProps {
  entryId: string;
  currentVersion: number;
  onRestore: (content: any, title: string) => void;
  onClose: () => void;
}

export function RevisionHistory({ entryId, currentVersion, onRestore, onClose }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);

  useEffect(() => {
    loadRevisions();
  }, [entryId]);

  const loadRevisions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('entry_revisions')
        .select('*')
        .eq('entry_id', entryId)
        .order('version', { ascending: false });

      if (error) throw error;
      setRevisions(data || []);
    } catch (err) {
      console.error('Failed to load revisions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (revision: Revision) => {
    if (!confirm(`Restore version ${revision.version}? The current content will be replaced.`)) return;
    onRestore(revision.content, revision.title);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getTimeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <>
      <Overlay onClick={onClose} />
      <Panel>
        <Header>
          <h3><Clock size={18} /> Revision History</h3>
          <button onClick={onClose}><X size={20} /></button>
        </Header>

        <List>
          {loading ? (
            <EmptyState>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <p>Loading revisions...</p>
            </EmptyState>
          ) : revisions.length === 0 ? (
            <EmptyState>
              <Clock size={32} />
              <p>No revision history yet.</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                Revisions are created automatically when you save changes.
              </p>
            </EmptyState>
          ) : (
            revisions.map(rev => (
              <RevisionItem
                key={rev.id}
                $active={selectedRevision?.id === rev.id}
                onClick={() => setSelectedRevision(rev)}
              >
                <div className="revision-header">
                  <span className="version">
                    <span className="version-badge">v{rev.version}</span>
                    {getTimeAgo(rev.created_at)}
                  </span>
                  <span className="date">{formatDate(rev.created_at)}</span>
                </div>
                <div className="title">{rev.title}</div>
                {selectedRevision?.id === rev.id && (
                  <div className="actions">
                    <ActionBtn onClick={() => setSelectedRevision(rev)}>
                      <Eye /> Preview
                    </ActionBtn>
                    <ActionBtn className="restore" onClick={() => handleRestore(rev)}>
                      <RotateCcw /> Restore this version
                    </ActionBtn>
                  </div>
                )}
              </RevisionItem>
            ))
          )}
        </List>

        {selectedRevision && (
          <PreviewPanel>
            <h4>Version {selectedRevision.version} — Content Preview</h4>
            <pre>{JSON.stringify(selectedRevision.content, null, 2)}</pre>
          </PreviewPanel>
        )}
      </Panel>
    </>
  );
}
