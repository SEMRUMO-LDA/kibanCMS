/**
 * SnapshotManager — modal for creating, listing, and rolling back collection snapshots.
 * "Git tags for content" — one-click backup and restore.
 */

import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { X, Camera, RotateCcw, Trash2, Loader, ShieldCheck, AlertTriangle } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { api } from '../lib/api';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.15s ease-out;
`;

const Panel = styled.div`
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: ${shadows.xl};
  animation: ${slideUp} 0.2s ease-out;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[5]} ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]};
`;

const Title = styled.h2`
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[900]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.gray[400]};
  padding: ${spacing[1]};
  border-radius: ${borders.radius.md};
  &:hover { color: ${colors.gray[600]}; background: ${colors.gray[100]}; }
`;

const Body = styled.div`
  padding: ${spacing[6]};
  overflow-y: auto;
  flex: 1;
`;

const CreateSection = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[6]};
`;

const Input = styled.input`
  flex: 1;
  padding: ${spacing[2]} ${spacing[3]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  &:focus { outline: 2px solid ${colors.accent[500]}; outline-offset: -1px; border-color: transparent; }
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `background: ${colors.accent[600]}; color: #fff; border: none; &:hover { background: ${colors.accent[700]}; }`;
      case 'danger':
        return `background: #dc2626; color: #fff; border: none; &:hover { background: #b91c1c; }`;
      case 'ghost':
      default:
        return `background: transparent; color: ${colors.gray[600]}; border: 1px solid ${colors.gray[200]}; &:hover { background: ${colors.gray[50]}; }`;
    }
  }}

  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SnapshotCard = styled.div`
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  margin-bottom: ${spacing[3]};
  transition: border-color 0.15s;
  &:hover { border-color: ${colors.gray[300]}; }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${spacing[2]};
`;

const CardTitle = styled.h4`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[900]};
  margin: 0;
`;

const CardMeta = styled.p`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[500]};
  margin: 0;
`;

const CardActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${spacing[8]} 0;
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};
`;

const WarningBox = styled.div`
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: ${borders.radius.lg};
  padding: ${spacing[3]} ${spacing[4]};
  margin-bottom: ${spacing[4]};
  font-size: ${typography.fontSize.xs};
  color: #92400e;
  display: flex;
  align-items: flex-start;
  gap: ${spacing[2]};
  line-height: 1.5;
`;

const spin = keyframes`to { transform: rotate(360deg); }`;
const Spinner = styled(Loader)`animation: ${spin} 1s linear infinite;`;

interface Snapshot {
  id: string;
  name: string;
  description: string | null;
  entry_count: number;
  created_at: string;
}

interface SnapshotManagerProps {
  collectionSlug: string;
  collectionName: string;
  onClose: () => void;
  onRollback?: () => void; // refresh entries list after rollback
}

export function SnapshotManager({ collectionSlug, collectionName, onClose, onRollback }: SnapshotManagerProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [name, setName] = useState('');

  const fetchSnapshots = async () => {
    setLoading(true);
    const { data } = await api.getSnapshots(collectionSlug);
    setSnapshots(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSnapshots(); }, [collectionSlug]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const { error } = await api.createSnapshot(collectionSlug, { name: name.trim() });
    if (!error) {
      setName('');
      await fetchSnapshots();
    }
    setCreating(false);
  };

  const handleRollback = async (snapshot: Snapshot) => {
    const confirmed = confirm(
      `Rollback "${collectionName}" to snapshot "${snapshot.name}"?\n\n` +
      `This will replace all current entries with the ${snapshot.entry_count} entries from this snapshot.\n\n` +
      `An automatic backup of the current state will be created first.`
    );
    if (!confirmed) return;

    setRollingBack(snapshot.id);
    const { error } = await api.rollbackSnapshot(collectionSlug, snapshot.id);
    setRollingBack(null);

    if (!error) {
      await fetchSnapshots();
      onRollback?.();
    }
  };

  const handleDelete = async (snapshot: Snapshot) => {
    if (!confirm(`Delete snapshot "${snapshot.name}"? This cannot be undone.`)) return;
    await api.deleteSnapshot(collectionSlug, snapshot.id);
    await fetchSnapshots();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Overlay onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Panel>
        <Header>
          <Title><Camera size={20} /> Snapshots</Title>
          <CloseBtn onClick={onClose}><X size={20} /></CloseBtn>
        </Header>

        <Body>
          {/* Create */}
          <CreateSection>
            <Input
              placeholder="Snapshot name (e.g. Before import, v2 launch)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Btn $variant="primary" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? <Spinner size={14} /> : <Camera size={14} />}
              Create
            </Btn>
          </CreateSection>

          <WarningBox>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Rollback creates an auto-backup first — you can always undo a rollback.
            </span>
          </WarningBox>

          {/* List */}
          {loading ? (
            <EmptyState><Spinner size={24} /></EmptyState>
          ) : snapshots.length === 0 ? (
            <EmptyState>
              <Camera size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />
              No snapshots yet. Create one before making big changes.
            </EmptyState>
          ) : (
            snapshots.map(snap => (
              <SnapshotCard key={snap.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{snap.name}</CardTitle>
                    <CardMeta>
                      {snap.entry_count} {snap.entry_count === 1 ? 'entry' : 'entries'} &middot; {formatDate(snap.created_at)}
                    </CardMeta>
                    {snap.description && (
                      <CardMeta style={{ marginTop: 4 }}>{snap.description}</CardMeta>
                    )}
                  </div>
                  <CardActions>
                    <Btn
                      $variant="ghost"
                      onClick={() => handleRollback(snap)}
                      disabled={rollingBack !== null}
                      title="Rollback to this snapshot"
                    >
                      {rollingBack === snap.id ? <Spinner size={14} /> : <RotateCcw size={14} />}
                      Rollback
                    </Btn>
                    <Btn
                      $variant="ghost"
                      onClick={() => handleDelete(snap)}
                      disabled={rollingBack !== null}
                      title="Delete this snapshot"
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </Btn>
                  </CardActions>
                </CardHeader>
              </SnapshotCard>
            ))
          )}
        </Body>
      </Panel>
    </Overlay>
  );
}
