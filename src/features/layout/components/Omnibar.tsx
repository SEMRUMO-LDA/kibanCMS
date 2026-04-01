/**
 * Omnibar Component - Universal Command Palette
 * CMD+K interface for instant navigation and actions
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import * as tokens from '../../../shared/styles/design-tokens';

// ============================================
// TYPES
// ============================================

type CommandType = 'navigation' | 'action' | 'search' | 'create';

interface Command {
  id: string;
  type: CommandType;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  action: () => void | Promise<void>;
  keywords?: string[];
}

interface OmnibarProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: ${tokens.colors.backdrop};
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: ${tokens.zIndex.omnibar};
  backdrop-filter: blur(4px);
  animation: ${props => props.$isOpen ? 'fadeIn' : 'fadeOut'} ${tokens.animations.duration.fast} ${tokens.animations.easing.out};

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;

const Container = styled.div`
  width: 100%;
  max-width: 600px;
  background: ${tokens.colors.white};
  border-radius: ${tokens.borders.radius.lg};
  box-shadow: ${tokens.shadows['2xl']};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
  animation: slideDown ${tokens.animations.duration.normal} ${tokens.animations.easing.spring};

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const SearchContainer = styled.div`
  padding: ${tokens.spacing[4]};
  border-bottom: ${tokens.borders.width.hairline} solid ${tokens.colors.gray[200]};
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: ${tokens.spacing[3]} ${tokens.spacing[12]} ${tokens.spacing[3]} ${tokens.spacing[4]};
  background: ${tokens.colors.gray[50]};
  border: ${tokens.borders.width.thin} solid transparent;
  border-radius: ${tokens.borders.radius.md};
  font-size: ${tokens.typography.fontSize.lg};
  font-weight: ${tokens.typography.fontWeight.medium};
  color: ${tokens.colors.black};
  transition: all ${tokens.animations.duration.fast};

  &::placeholder {
    color: ${tokens.colors.gray[400]};
    font-weight: ${tokens.typography.fontWeight.regular};
  }

  &:focus {
    outline: none;
    background: ${tokens.colors.white};
    border-color: ${tokens.colors.gray[300]};
    box-shadow: ${tokens.shadows.focus};
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  right: ${tokens.spacing[4]};
  top: 50%;
  transform: translateY(-50%);
  padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
  background: ${tokens.colors.gray[100]};
  border-radius: ${tokens.borders.radius.sm};
  font-family: ${tokens.typography.fontFamily.mono};
  font-size: ${tokens.typography.fontSize.xs};
  color: ${tokens.colors.gray[600]};
  font-weight: ${tokens.typography.fontWeight.medium};
`;

const ResultsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${tokens.spacing[2]};

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${tokens.colors.gray[300]};
    border-radius: ${tokens.borders.radius.full};
  }
`;

const ResultGroup = styled.div`
  margin-bottom: ${tokens.spacing[4]};

  &:last-child {
    margin-bottom: 0;
  }
`;

const GroupLabel = styled.div`
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  font-size: ${tokens.typography.fontSize.xs};
  font-weight: ${tokens.typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: ${tokens.typography.letterSpacing.wider};
  color: ${tokens.colors.gray[500]};
`;

const ResultItem = styled.button<{ $selected: boolean }>`
  width: 100%;
  padding: ${tokens.spacing[3]};
  display: flex;
  align-items: center;
  background: ${props => props.$selected ? tokens.colors.gray[100] : 'transparent'};
  border: none;
  border-radius: ${tokens.borders.radius.md};
  cursor: pointer;
  transition: all ${tokens.animations.duration.fast};
  text-align: left;

  &:hover {
    background: ${tokens.colors.gray[50]};
  }

  &:focus {
    outline: none;
    background: ${tokens.colors.gray[100]};
  }
`;

const ItemIcon = styled.div`
  width: 32px;
  height: 32px;
  background: ${tokens.colors.black};
  color: ${tokens.colors.white};
  border-radius: ${tokens.borders.radius.md};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${tokens.typography.fontWeight.bold};
  font-size: ${tokens.typography.fontSize.sm};
  margin-right: ${tokens.spacing[3]};
  flex-shrink: 0;
`;

const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemLabel = styled.div`
  font-size: ${tokens.typography.fontSize.sm};
  font-weight: ${tokens.typography.fontWeight.semibold};
  color: ${tokens.colors.black};
  margin-bottom: ${tokens.spacing[0.5]};
`;

const ItemDescription = styled.div`
  font-size: ${tokens.typography.fontSize.xs};
  color: ${tokens.colors.gray[600]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ItemShortcut = styled.div`
  margin-left: auto;
  padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
  background: ${tokens.colors.gray[100]};
  border-radius: ${tokens.borders.radius.sm};
  font-family: ${tokens.typography.fontFamily.mono};
  font-size: ${tokens.typography.fontSize['2xs']};
  color: ${tokens.colors.gray[600]};
  font-weight: ${tokens.typography.fontWeight.medium};
`;

const NoResults = styled.div`
  padding: ${tokens.spacing[8]} ${tokens.spacing[4]};
  text-align: center;
  color: ${tokens.colors.gray[500]};
  font-size: ${tokens.typography.fontSize.sm};
`;

// ============================================
// COMPONENT
// ============================================

export const Omnibar: React.FC<OmnibarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debouncedQuery = useDebounce(query, 150);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Commands database
  const allCommands: Command[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-dashboard',
      type: 'navigation',
      label: 'Go to Dashboard',
      description: 'View your dashboard',
      icon: '◐',
      shortcut: '⌘D',
      action: () => {
        navigate('/dashboard');
        onClose();
      },
      keywords: ['home', 'overview'],
    },
    {
      id: 'nav-content',
      type: 'navigation',
      label: 'Go to Content',
      description: 'Manage your content',
      icon: '☐',
      action: () => {
        navigate('/content');
        onClose();
      },
      keywords: ['posts', 'pages', 'articles'],
    },
    {
      id: 'nav-media',
      type: 'navigation',
      label: 'Go to Media Library',
      description: 'Manage media files',
      icon: '◧',
      action: () => {
        navigate('/media');
        onClose();
      },
      keywords: ['images', 'videos', 'files'],
    },

    // Create actions
    {
      id: 'create-post',
      type: 'create',
      label: 'Create New Post',
      description: 'Start writing a new blog post',
      icon: '+',
      shortcut: '⌘N',
      action: () => {
        navigate('/content/new?type=post');
        onClose();
      },
      keywords: ['new', 'write', 'blog'],
    },
    {
      id: 'create-page',
      type: 'create',
      label: 'Create New Page',
      description: 'Create a static page',
      icon: '+',
      action: () => {
        navigate('/content/new?type=page');
        onClose();
      },
      keywords: ['new', 'static'],
    },
    {
      id: 'upload-media',
      type: 'create',
      label: 'Upload Media',
      description: 'Upload images or files',
      icon: '↑',
      action: () => {
        navigate('/media/upload');
        onClose();
      },
      keywords: ['upload', 'image', 'file'],
    },

    // Actions
    {
      id: 'action-search',
      type: 'action',
      label: 'Search Content',
      description: 'Search across all content',
      icon: '⌕',
      shortcut: '⌘F',
      action: () => {
        navigate('/search');
        onClose();
      },
      keywords: ['find', 'query'],
    },
    {
      id: 'action-settings',
      type: 'action',
      label: 'Settings',
      description: 'Configure your CMS',
      icon: '◉',
      shortcut: '⌘,',
      action: () => {
        navigate('/settings');
        onClose();
      },
      keywords: ['preferences', 'config'],
    },
    {
      id: 'action-help',
      type: 'action',
      label: 'Help & Documentation',
      description: 'Get help and read docs',
      icon: '?',
      shortcut: '⌘/',
      action: () => {
        navigate('/help');
        onClose();
      },
      keywords: ['docs', 'support', 'guide'],
    },
  ], [navigate, onClose]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!debouncedQuery) return allCommands;

    const lowerQuery = debouncedQuery.toLowerCase();
    return allCommands.filter(cmd => {
      const searchText = `${cmd.label} ${cmd.description} ${cmd.keywords?.join(' ')}`.toLowerCase();
      return searchText.includes(lowerQuery);
    });
  }, [debouncedQuery, allCommands]);

  // Group commands by type
  const groupedCommands = useMemo(() => {
    const groups: Record<CommandType, Command[]> = {
      navigation: [],
      create: [],
      action: [],
      search: [],
    };

    filteredCommands.forEach(cmd => {
      groups[cmd.type].push(cmd);
    });

    return groups;
  }, [filteredCommands]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const totalCommands = filteredCommands.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % totalCommands);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + totalCommands) % totalCommands);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let commandIndex = 0;

  return (
    <Overlay $isOpen={isOpen} onClick={onClose}>
      <Container onClick={e => e.stopPropagation()}>
        <SearchContainer>
          <SearchInput
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <SearchIcon>ESC</SearchIcon>
        </SearchContainer>

        <ResultsContainer ref={resultsRef}>
          {filteredCommands.length === 0 ? (
            <NoResults>
              No results found for "{debouncedQuery}"
            </NoResults>
          ) : (
            <>
              {Object.entries(groupedCommands).map(([type, commands]) => {
                if (commands.length === 0) return null;

                return (
                  <ResultGroup key={type}>
                    <GroupLabel>
                      {type === 'navigation' && 'Navigate'}
                      {type === 'create' && 'Create'}
                      {type === 'action' && 'Actions'}
                      {type === 'search' && 'Search'}
                    </GroupLabel>
                    {commands.map(cmd => {
                      const currentIndex = commandIndex++;
                      return (
                        <ResultItem
                          key={cmd.id}
                          data-index={currentIndex}
                          $selected={currentIndex === selectedIndex}
                          onClick={() => cmd.action()}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                        >
                          <ItemIcon>{cmd.icon}</ItemIcon>
                          <ItemContent>
                            <ItemLabel>{cmd.label}</ItemLabel>
                            {cmd.description && (
                              <ItemDescription>{cmd.description}</ItemDescription>
                            )}
                          </ItemContent>
                          {cmd.shortcut && (
                            <ItemShortcut>{cmd.shortcut}</ItemShortcut>
                          )}
                        </ResultItem>
                      );
                    })}
                  </ResultGroup>
                );
              })}
            </>
          )}
        </ResultsContainer>
      </Container>
    </Overlay>
  );
};

export default Omnibar;