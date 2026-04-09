import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Loader, Eye, X, Download } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';

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
// TYPES
// ============================================

interface Entry {
  id: string;
  title: string;
  slug: string;
  content?: Record<string, any>;
  status: string;
  tags?: string[];
  meta?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  max-width: 1400px;
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing[8]};
  gap: ${spacing[4]};
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[4]};
  min-width: 0;
  flex: 1;
`;

const BackButton = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  padding: ${spacing[3]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.gray[600]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  flex-shrink: 0;

  &:hover {
    background: ${colors.gray[50]};
    border-color: ${colors.gray[300]};
    color: ${colors.gray[900]};
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }
`;

const TitleSection = styled.div`
  min-width: 0;
  flex: 1;

  h1 {
    font-size: ${typography.fontSize['3xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[1]} 0;
    letter-spacing: ${typography.letterSpacing.tight};
    color: ${colors.gray[900]};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

const CreateButton = styled.button`
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${borders.radius.lg};
  font-weight: ${typography.fontWeight.semibold};
  font-size: ${typography.fontSize.sm};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};
  font-family: ${typography.fontFamily.sans};
  white-space: nowrap;

  &:hover {
    background: ${colors.accent[600]};
    box-shadow: ${shadows.md};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
  }
`;

const Controls = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[6]};
  flex-wrap: wrap;
`;

const SearchBox = styled.div`
  flex: 1;
  min-width: 280px;
  position: relative;

  input {
    width: 100%;
    padding: ${spacing[3]} ${spacing[4]} ${spacing[3]} ${spacing[11]};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.sm};
    background: ${colors.white};
    color: ${colors.gray[900]};
    transition: all ${animations.duration.fast} ${animations.easing.out};
    font-family: ${typography.fontFamily.sans};

    &::placeholder {
      color: ${colors.gray[400]};
    }

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
    }
  }

  svg {
    position: absolute;
    left: ${spacing[4]};
    top: 50%;
    transform: translateY(-50%);
    color: ${colors.gray[400]};
    pointer-events: none;
  }
`;

const FilterButton = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[700]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};
  white-space: nowrap;

  &:hover {
    background: ${colors.gray[50]};
    border-color: ${colors.gray[300]};
    color: ${colors.gray[900]};
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }
`;

const CodeButton = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  padding: ${spacing[3]} ${spacing[4]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[700]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};
  white-space: nowrap;

  &:hover {
    background: ${colors.accent[50]};
    border-color: ${colors.accent[300]};
    color: ${colors.accent[700]};

    svg {
      color: ${colors.accent[600]};
    }
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }

  svg {
    transition: color ${animations.duration.fast} ${animations.easing.out};
  }
`;

const TableContainer = styled.div`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  box-shadow: ${shadows.sm};
`;

const Table = styled.table`
  width: 100%;

  thead {
    background: ${colors.gray[50]};
    border-bottom: 1px solid ${colors.gray[200]};

    th {
      text-align: left;
      padding: ${spacing[4]} ${spacing[5]};
      font-weight: ${typography.fontWeight.semibold};
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[600]};
      text-transform: uppercase;
      letter-spacing: ${typography.letterSpacing.wider};
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid ${colors.gray[100]};
      transition: background ${animations.duration.fast} ${animations.easing.out};

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: ${colors.accent[50]};
      }
    }

    td {
      padding: ${spacing[5]};
      font-size: ${typography.fontSize.sm};
      color: ${colors.gray[700]};
      vertical-align: middle;

      &.title {
        font-weight: ${typography.fontWeight.medium};
        color: ${colors.gray[900]};
      }

      &.slug {
        font-family: ${typography.fontFamily.mono};
        font-size: ${typography.fontSize.xs};
        color: ${colors.gray[500]};
      }
    }
  }
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: ${spacing[1.5]} ${spacing[3]};
  border-radius: ${borders.radius.full};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  text-transform: capitalize;
  white-space: nowrap;

  ${props => {
    switch (props.$status) {
      case 'published':
        return `
          background: #dcfce7;
          color: #166534;
        `;
      case 'review':
        return `
          background: #fef3c7;
          color: #92400e;
        `;
      case 'scheduled':
        return `
          background: #dbeafe;
          color: #1e40af;
        `;
      case 'archived':
        return `
          background: ${colors.gray[200]};
          color: ${colors.gray[700]};
        `;
      default: // draft
        return `
          background: ${colors.gray[100]};
          color: ${colors.gray[600]};
        `;
    }
  }}
`;

const Actions = styled.div`
  display: flex;
  gap: ${spacing[2]};
`;

const ActionButton = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  padding: ${spacing[2]};
  border-radius: ${borders.radius.md};
  cursor: pointer;
  color: ${colors.gray[600]};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.gray[50]};
    color: ${colors.gray[900]};
    border-color: ${colors.gray[300]};
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }

  &.delete:hover {
    background: ${colors.gray[50]};
    color: #dc2626;
    border-color: #fecaca;
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

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: ${colors.backdrop};
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${spacing[4]};
`;

const ModalContent = styled.div`
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows['2xl']};
  width: 100%;
  max-width: 500px;
`;

const ModalHeader = styled.div`
  padding: ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0;
  }

  button {
    background: none;
    border: none;
    color: ${colors.gray[400]};
    cursor: pointer;
    padding: ${spacing[2]};
    border-radius: ${borders.radius.md};

    &:hover {
      background: ${colors.gray[100]};
      color: ${colors.gray[600]};
    }
  }
`;

const ModalBody = styled.div`
  padding: ${spacing[6]};
`;

const ModalFooter = styled.div`
  padding: ${spacing[4]} ${spacing[6]} ${spacing[6]};
  display: flex;
  gap: ${spacing[3]};
  justify-content: flex-end;

  button {
    padding: ${spacing[3]} ${spacing[5]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    cursor: pointer;
    font-family: ${typography.fontFamily.sans};
    transition: all ${animations.duration.fast} ${animations.easing.out};
    background: ${colors.white};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[300]};

    &:hover {
      background: ${colors.gray[50]};
    }

    &.primary {
      background: ${colors.accent[500]};
      color: ${colors.white};
      border: none;

      &:hover {
        background: ${colors.accent[600]};
      }
    }
  }
`;

const FilterGroup = styled.div`
  margin-bottom: ${spacing[5]};

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[3]};
  }
`;

const FilterOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${spacing[2]};
`;

const FilterOption = styled.button<{ $active?: boolean }>`
  padding: ${spacing[3]};
  background: ${props => props.$active ? colors.accent[50] : colors.white};
  border: 1px solid ${props => props.$active ? colors.accent[300] : colors.gray[200]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${props => props.$active ? colors.accent[700] : colors.gray[700]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  font-family: ${typography.fontFamily.sans};

  &:hover {
    background: ${props => props.$active ? colors.accent[100] : colors.gray[50]};
    border-color: ${props => props.$active ? colors.accent[400] : colors.gray[300]};
  }
`;

const BulkActionsBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]};
  background: ${colors.accent[50]};
  border: 1px solid ${colors.accent[200]};
  border-radius: ${borders.radius.lg};
  margin-bottom: ${spacing[4]};

  .count {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.accent[900]};
  }

  select {
    padding: ${spacing[2]} ${spacing[3]};
    border: 1px solid ${colors.accent[300]};
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    background: ${colors.white};
    color: ${colors.gray[700]};
    cursor: pointer;
    font-family: ${typography.fontFamily.sans};
  }

  button {
    padding: ${spacing[2]} ${spacing[4]};
    background: ${colors.accent[500]};
    color: ${colors.white};
    border: none;
    border-radius: ${borders.radius.md};
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    cursor: pointer;
    font-family: ${typography.fontFamily.sans};

    &:hover {
      background: ${colors.accent[600]};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: ${colors.accent[500]};
`;

const ViewModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${colors.backdrop};
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${spacing[4]};
`;

const ViewModalBox = styled.div`
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows['2xl']};
  width: 100%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
`;

const ViewModalHeader = styled.div`
  padding: ${spacing[5]} ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: ${spacing[2]};
    flex-shrink: 0;
  }
`;

const ViewModalBody = styled.div`
  padding: ${spacing[6]};
  overflow-y: auto;
  flex: 1;
`;

const ViewField = styled.div`
  margin-bottom: ${spacing[5]};

  &:last-child { margin-bottom: 0; }

  .label {
    font-size: ${typography.fontSize.xs};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[500]};
    text-transform: uppercase;
    letter-spacing: ${typography.letterSpacing.wider};
    margin-bottom: ${spacing[1]};
  }

  .value {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[900]};
    line-height: ${typography.lineHeight.relaxed};
    word-break: break-word;
    white-space: pre-wrap;
  }

  .empty {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[400]};
    font-style: italic;
  }
`;

const ViewFieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${spacing[4]};

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

// ============================================
// COMPONENT
// ============================================

export const CollectionEntries = () => {
  const { collectionSlug } = useParams<{ collectionSlug: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>('');
  const [viewEntry, setViewEntry] = useState<Entry | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!collectionSlug) return;

      try {
        setLoading(true);
        setError(null);

        // Get collection name
        const { data: colData } = await api.getCollection(collectionSlug);
        if (colData) setCollectionName(colData.name);

        // Get entries via API
        const { data: entriesData, error: entriesErr, meta } = await api.getEntries(collectionSlug);
        if (entriesErr) throw new Error(entriesErr);

        setEntries(entriesData || []);
        if (meta?.collection?.name) setCollectionName(meta.collection.name);
      } catch (err: any) {
        console.error('Error loading entries:', err);
        setError(err.message || 'Failed to load entries');
      } finally {
        setLoading(false);
      }
    }

    loadData();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, [collectionSlug]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title || 'this entry'}"? This action cannot be undone.`)) return;

    try {
      const entry = entries.find(e => e.id === id);
      if (!entry || !collectionSlug) return;

      const { error } = await api.deleteEntry(collectionSlug, entry.slug);
      if (error) throw new Error(error);

      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  const toggleSelectEntry = (id: string) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEntries.size === filteredEntries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(filteredEntries.map(e => e.id)));
    }
  };

  const handleBulkAction = async () => {
    if (selectedEntries.size === 0 || !bulkAction) return;

    const action = bulkAction;
    const count = selectedEntries.size;

    if (action === 'delete') {
      if (!confirm(`Delete ${count} ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) {
        return;
      }
    }

    try {
      if (action === 'delete') {
        const { error } = await supabase
          .from('entries')
          .delete()
          .in('id', Array.from(selectedEntries));

        if (error) throw error;

        setEntries(prev => prev.filter(e => !selectedEntries.has(e.id)));
      } else {
        // Publish or Archive
        const { error } = await supabase
          .from('entries')
          .update({ status: action })
          .in('id', Array.from(selectedEntries));

        if (error) throw error;

        setEntries(prev => prev.map(e =>
          selectedEntries.has(e.id) ? { ...e, status: action } : e
        ));
      }

      setSelectedEntries(new Set());
      setBulkAction('');
      toast.success(`${action}ed ${count} ${count === 1 ? 'entry' : 'entries'}`);
    } catch (err: any) {
      console.error('Error with bulk action:', err);
      toast.error('Bulk action failed: ' + (err.message || 'Unknown error'));
    }
  };

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.slug?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || entry.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;

    const allKeys = new Set<string>();
    allKeys.add('title');
    allKeys.add('slug');
    allKeys.add('status');
    allKeys.add('created_at');

    filteredEntries.forEach(e => {
      if (e.content && typeof e.content === 'object') {
        Object.keys(e.content).forEach(k => allKeys.add(k));
      }
    });

    const headers = Array.from(allKeys);

    const csvRows = [
      headers.join(','),
      ...filteredEntries.map(entry => {
        return headers.map(key => {
          let val: any;
          if (key === 'title') val = entry.title;
          else if (key === 'slug') val = entry.slug;
          else if (key === 'status') val = entry.status;
          else if (key === 'created_at') val = entry.created_at;
          else val = entry.content?.[key];

          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        }).join(',');
      }),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collectionSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Loader size={40} />
          <p>Loading entries...</p>
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorState>
          <h3>Error Loading Entries</h3>
          <p>{error}</p>
        </ErrorState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <BackButton onClick={() => navigate('/content')} aria-label="Back to collections">
            <ArrowLeft size={20} />
          </BackButton>
          <TitleSection>
            <h1>{collectionName || collectionSlug}</h1>
            <p>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
          </TitleSection>
        </HeaderLeft>
        <div style={{ display: 'flex', gap: spacing[3], alignItems: 'center' }}>
          {entries.length > 0 && (
            <CodeButton onClick={handleExportCSV}>
              <Download size={18} />
              Export CSV
            </CodeButton>
          )}
          <CreateButton onClick={() => navigate(`/content/${collectionSlug}/new`)}>
            <Plus size={20} />
            Create Entry
          </CreateButton>
        </div>
      </Header>

      <Controls>
        <SearchBox>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by title or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search entries"
          />
        </SearchBox>
        <div style={{ display: 'flex', gap: spacing[1], background: colors.gray[100], borderRadius: borders.radius.lg, padding: '3px' }}>
          {['all', 'draft', 'published', 'review', 'archived'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: `${spacing[2]} ${spacing[3]}`,
                borderRadius: borders.radius.md,
                border: 'none',
                background: filterStatus === status ? colors.white : 'transparent',
                boxShadow: filterStatus === status ? shadows.sm : 'none',
                color: filterStatus === status ? colors.gray[900] : colors.gray[500],
                fontWeight: filterStatus === status ? 600 : 500,
                fontSize: typography.fontSize.xs,
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontFamily: typography.fontFamily.sans,
                transition: 'all 0.15s',
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </Controls>

      {selectedEntries.size > 0 && (
        <BulkActionsBar>
          <span className="count">{selectedEntries.size} selected</span>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="">Select action...</option>
            <option value="published">Publish</option>
            <option value="archived">Archive</option>
            <option value="delete">Delete</option>
          </select>
          <button onClick={handleBulkAction} disabled={!bulkAction}>
            Apply
          </button>
          <button onClick={() => setSelectedEntries(new Set())} style={{ background: colors.gray[400] }}>
            Clear
          </button>
        </BulkActionsBar>
      )}

      {filteredEntries.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <Plus />
          </div>
          <h3>{searchTerm ? 'No entries found' : 'No entries yet'}</h3>
          <p>
            {searchTerm
              ? 'Try adjusting your search terms or create a new entry.'
              : 'Get started by creating your first entry for this collection.'}
          </p>
          {!searchTerm && (
            <CreateButton onClick={() => navigate(`/content/${collectionSlug}/new`)}>
              <Plus size={20} />
              Create First Entry
            </CreateButton>
          )}
        </EmptyState>
      ) : (
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>
                  <Checkbox
                    checked={selectedEntries.size === filteredEntries.length && filteredEntries.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th style={{ width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Checkbox
                      checked={selectedEntries.has(entry.id)}
                      onChange={() => toggleSelectEntry(entry.id)}
                    />
                  </td>
                  <td className="title">{entry.title || 'Untitled'}</td>
                  <td className="slug">{entry.slug || '-'}</td>
                  <td>
                    <StatusBadge $status={entry.status || 'draft'}>
                      {entry.status || 'draft'}
                    </StatusBadge>
                  </td>
                  <td>{formatDate(entry.created_at)}</td>
                  <td>{formatDate(entry.updated_at)}</td>
                  <td>
                    <Actions>
                      <ActionButton
                        onClick={() => setViewEntry(entry)}
                        aria-label="View entry"
                        title="View"
                      >
                        <Eye size={16} />
                      </ActionButton>
                      <ActionButton
                        onClick={() => navigate(`/content/${collectionSlug}/edit/${entry.id}`)}
                        aria-label="Edit entry"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </ActionButton>
                      <ActionButton
                        className="delete"
                        onClick={() => handleDelete(entry.id, entry.title)}
                        aria-label="Delete entry"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </ActionButton>
                    </Actions>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}

      {viewEntry && (
        <ViewModalOverlay onClick={() => setViewEntry(null)}>
          <ViewModalBox onClick={(e) => e.stopPropagation()}>
            <ViewModalHeader>
              <h3>{viewEntry.title || 'Untitled'}</h3>
              <div className="actions">
                <ActionButton
                  onClick={() => {
                    setViewEntry(null);
                    navigate(`/content/${collectionSlug}/edit/${viewEntry.id}`);
                  }}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </ActionButton>
                <ActionButton onClick={() => setViewEntry(null)} title="Close">
                  <X size={16} />
                </ActionButton>
              </div>
            </ViewModalHeader>
            <ViewModalBody>
              <ViewFieldGrid>
                <ViewField>
                  <div className="label">Status</div>
                  <div className="value">
                    <StatusBadge $status={viewEntry.status || 'draft'}>{viewEntry.status || 'draft'}</StatusBadge>
                  </div>
                </ViewField>
                <ViewField>
                  <div className="label">Slug</div>
                  <div className="value" style={{ fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.xs }}>{viewEntry.slug}</div>
                </ViewField>
                <ViewField>
                  <div className="label">Created</div>
                  <div className="value">{formatDate(viewEntry.created_at)}</div>
                </ViewField>
                <ViewField>
                  <div className="label">Updated</div>
                  <div className="value">{formatDate(viewEntry.updated_at)}</div>
                </ViewField>
              </ViewFieldGrid>

              {viewEntry.tags && viewEntry.tags.length > 0 && (
                <ViewField style={{ marginTop: spacing[5] }}>
                  <div className="label">Tags</div>
                  <div className="value" style={{ display: 'flex', gap: spacing[2], flexWrap: 'wrap' }}>
                    {viewEntry.tags.map(tag => (
                      <span key={tag} style={{
                        padding: `${spacing[1]} ${spacing[3]}`,
                        background: colors.gray[100],
                        borderRadius: borders.radius.full,
                        fontSize: typography.fontSize.xs,
                        color: colors.gray[700],
                      }}>{tag}</span>
                    ))}
                  </div>
                </ViewField>
              )}

              {viewEntry.content && Object.keys(viewEntry.content).length > 0 && (
                <div style={{ marginTop: spacing[6], borderTop: `1px solid ${colors.gray[200]}`, paddingTop: spacing[6] }}>
                  {Object.entries(viewEntry.content).map(([key, value]) => (
                    <ViewField key={key}>
                      <div className="label">{key.replace(/_/g, ' ')}</div>
                      {value === null || value === undefined || value === '' ? (
                        <div className="empty">—</div>
                      ) : typeof value === 'boolean' ? (
                        <div className="value">{value ? 'Yes' : 'No'}</div>
                      ) : typeof value === 'object' ? (
                        <pre style={{
                          fontSize: typography.fontSize.xs,
                          fontFamily: typography.fontFamily.mono,
                          background: colors.gray[50],
                          padding: spacing[3],
                          borderRadius: borders.radius.md,
                          overflow: 'auto',
                          margin: 0,
                          color: colors.gray[800],
                        }}>{JSON.stringify(value, null, 2)}</pre>
                      ) : (
                        <div className="value">{String(value)}</div>
                      )}
                    </ViewField>
                  ))}
                </div>
              )}
            </ViewModalBody>
          </ViewModalBox>
        </ViewModalOverlay>
      )}

      {showFilterModal && (
        <Modal onClick={() => setShowFilterModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>Filter Entries</h3>
              <button onClick={() => setShowFilterModal(false)} aria-label="Close">
                <X size={20} />
              </button>
            </ModalHeader>
            <ModalBody>
              <FilterGroup>
                <label>Status</label>
                <FilterOptions>
                  <FilterOption
                    $active={filterStatus === 'all'}
                    onClick={() => setFilterStatus('all')}
                  >
                    All
                  </FilterOption>
                  <FilterOption
                    $active={filterStatus === 'published'}
                    onClick={() => setFilterStatus('published')}
                  >
                    Published
                  </FilterOption>
                  <FilterOption
                    $active={filterStatus === 'draft'}
                    onClick={() => setFilterStatus('draft')}
                  >
                    Draft
                  </FilterOption>
                  <FilterOption
                    $active={filterStatus === 'archived'}
                    onClick={() => setFilterStatus('archived')}
                  >
                    Archived
                  </FilterOption>
                </FilterOptions>
              </FilterGroup>
            </ModalBody>
            <ModalFooter>
              <button
                onClick={() => {
                  setFilterStatus('all');
                  setShowFilterModal(false);
                }}
              >
                Clear Filters
              </button>
              <button className="primary" onClick={() => setShowFilterModal(false)}>
                Apply Filters
              </button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};
