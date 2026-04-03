/**
 * Command Palette (Cmd+K)
 * Global search across collections, entries, and quick navigation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  Search, FileText, Files, Image as ImageIcon, Users, Settings,
  LayoutDashboard, ArrowRight, Hash, X, Loader
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  animation: ${fadeIn} 0.15s ease-out;
`;

const Modal = styled.div`
  width: 100%;
  max-width: 640px;
  background: ${colors.white};
  border-radius: ${borders.radius['2xl']};
  box-shadow: ${shadows['2xl']}, 0 0 0 1px rgba(0,0,0,0.05);
  overflow: hidden;
  animation: ${slideUp} 0.2s ease-out;
`;

const SearchInput = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]} ${spacing[5]};
  border-bottom: 1px solid ${colors.gray[200]};

  svg.search-icon {
    color: ${colors.gray[400]};
    flex-shrink: 0;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    font-size: ${typography.fontSize.base};
    color: ${colors.gray[900]};
    font-family: ${typography.fontFamily.sans};
    background: transparent;

    &::placeholder {
      color: ${colors.gray[400]};
    }
  }

  kbd {
    padding: ${spacing[1]} ${spacing[2]};
    background: ${colors.gray[100]};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.sm};
    font-size: 11px;
    font-family: ${typography.fontFamily.mono};
    color: ${colors.gray[500]};
    flex-shrink: 0;
  }
`;

const Results = styled.div`
  max-height: 400px;
  overflow-y: auto;
  padding: ${spacing[2]} 0;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${colors.gray[300]};
    border-radius: ${borders.radius.full};
  }
`;

const Group = styled.div`
  padding: ${spacing[1]} ${spacing[3]};

  .group-label {
    font-size: 11px;
    font-weight: ${typography.fontWeight.semibold};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${colors.gray[500]};
    padding: ${spacing[2]} ${spacing[2]};
  }
`;

const ResultItem = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[3]};
  margin: 0 ${spacing[1]};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  transition: all 0.1s;
  background: ${props => props.$active ? colors.accent[50] : 'transparent'};

  &:hover {
    background: ${colors.gray[50]};
  }

  ${props => props.$active && `
    background: ${colors.accent[50]};
    &:hover { background: ${colors.accent[100]}; }
  `}

  .item-icon {
    width: 36px;
    height: 36px;
    border-radius: ${borders.radius.md};
    background: ${colors.gray[100]};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.gray[500]};
    flex-shrink: 0;

    svg { width: 18px; height: 18px; }
  }

  .item-content {
    flex: 1;
    min-width: 0;

    .item-title {
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.medium};
      color: ${colors.gray[900]};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-meta {
      font-size: 12px;
      color: ${colors.gray[500]};
    }
  }

  .item-arrow {
    color: ${colors.gray[300]};
    flex-shrink: 0;
  }
`;

const EmptyState = styled.div`
  padding: ${spacing[8]} ${spacing[4]};
  text-align: center;
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};
`;

const Footer = styled.div`
  padding: ${spacing[3]} ${spacing[4]};
  border-top: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  gap: ${spacing[4]};
  font-size: 12px;
  color: ${colors.gray[500]};
  background: ${colors.gray[50]};

  span {
    display: flex;
    align-items: center;
    gap: ${spacing[1]};
  }

  kbd {
    padding: 2px 6px;
    background: ${colors.white};
    border: 1px solid ${colors.gray[200]};
    border-radius: 4px;
    font-family: ${typography.fontFamily.mono};
    font-size: 11px;
  }
`;

// Quick nav items (always shown when no query)
const QUICK_NAV = [
  { title: 'Dashboard', path: '/', icon: LayoutDashboard, meta: 'Overview' },
  { title: 'Content', path: '/content', icon: Files, meta: 'Collections' },
  { title: 'Media', path: '/media', icon: ImageIcon, meta: 'Library' },
  { title: 'Users', path: '/users', icon: Users, meta: 'Management' },
  { title: 'Settings', path: '/settings', icon: Settings, meta: 'API Keys' },
  { title: 'New Collection', path: '/content/builder', icon: Hash, meta: 'Create' },
];

interface SearchResult {
  id: string;
  title: string;
  meta: string;
  path: string;
  type: 'collection' | 'entry' | 'nav';
  icon: any;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const q = query.toLowerCase();
      const items: SearchResult[] = [];

      try {
        // Search collections
        const { data: collections } = await supabase
          .from('collections')
          .select('id, name, slug, type')
          .ilike('name', `%${q}%`)
          .limit(5);

        collections?.forEach(c => {
          items.push({
            id: c.id,
            title: c.name,
            meta: c.type,
            path: `/content/${c.slug}`,
            type: 'collection',
            icon: Files,
          });
        });

        // Search entries
        const { data: entries } = await supabase
          .from('entries')
          .select('id, title, slug, status, collection_id')
          .ilike('title', `%${q}%`)
          .limit(8);

        if (entries && entries.length > 0) {
          // Get collection slugs for entries
          const collectionIds = [...new Set(entries.map(e => e.collection_id))];
          const { data: cols } = await supabase
            .from('collections')
            .select('id, slug')
            .in('id', collectionIds);
          const colMap = new Map(cols?.map(c => [c.id, c.slug]) || []);

          entries.forEach(e => {
            const colSlug = colMap.get(e.collection_id) || '';
            items.push({
              id: e.id,
              title: e.title || 'Untitled',
              meta: e.status,
              path: `/content/${colSlug}/edit/${e.id}`,
              type: 'entry',
              icon: FileText,
            });
          });
        }
      } catch {
        // Silently fail — search is best-effort
      }

      // Also filter quick nav
      QUICK_NAV.forEach(item => {
        if (item.title.toLowerCase().includes(q)) {
          items.push({
            id: item.path,
            title: item.title,
            meta: item.meta,
            path: item.path,
            type: 'nav',
            icon: item.icon,
          });
        }
      });

      setResults(items);
      setActiveIndex(0);
      setSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Get display items
  const displayItems: SearchResult[] = query.trim()
    ? results
    : QUICK_NAV.map(item => ({
        id: item.path,
        title: item.title,
        meta: item.meta,
        path: item.path,
        type: 'nav' as const,
        icon: item.icon,
      }));

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && displayItems[activeIndex]) {
      navigate(displayItems[activeIndex].path);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [displayItems, activeIndex, navigate, onClose]);

  if (!isOpen) return null;

  // Group results by type
  const collections = displayItems.filter(r => r.type === 'collection');
  const entries = displayItems.filter(r => r.type === 'entry');
  const nav = displayItems.filter(r => r.type === 'nav');

  const renderItem = (item: SearchResult, globalIndex: number) => {
    const Icon = item.icon;
    return (
      <ResultItem
        key={item.id}
        $active={globalIndex === activeIndex}
        onClick={() => { navigate(item.path); onClose(); }}
        onMouseEnter={() => setActiveIndex(globalIndex)}
      >
        <div className="item-icon"><Icon /></div>
        <div className="item-content">
          <div className="item-title">{item.title}</div>
          <div className="item-meta">{item.meta}</div>
        </div>
        <ArrowRight size={14} className="item-arrow" />
      </ResultItem>
    );
  };

  let globalIdx = 0;

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <SearchInput>
          {searching ? <Loader size={20} className="search-icon" style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={20} className="search-icon" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search collections, entries, pages..."
          />
          <kbd>ESC</kbd>
        </SearchInput>

        <Results>
          {displayItems.length === 0 && query.trim() ? (
            <EmptyState>No results for "{query}"</EmptyState>
          ) : (
            <>
              {collections.length > 0 && (
                <Group>
                  <div className="group-label">Collections</div>
                  {collections.map(item => renderItem(item, globalIdx++))}
                </Group>
              )}
              {entries.length > 0 && (
                <Group>
                  <div className="group-label">Entries</div>
                  {entries.map(item => renderItem(item, globalIdx++))}
                </Group>
              )}
              {nav.length > 0 && (
                <Group>
                  <div className="group-label">{query.trim() ? 'Pages' : 'Quick Navigation'}</div>
                  {nav.map(item => renderItem(item, globalIdx++))}
                </Group>
              )}
            </>
          )}
        </Results>

        <Footer>
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </Footer>
      </Modal>
    </Overlay>
  );
};
