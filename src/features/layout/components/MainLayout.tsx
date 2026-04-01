/**
 * MainLayout Component - kibanCMS Shell
 * Ultra-clean, monochrome, keyboard-first interface
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Omnibar } from './Omnibar';
import { FocusMode } from './FocusMode';
import { useKeyboard } from '../../../shared/hooks/useKeyboard';
import { useAuth } from '../../auth/hooks/useAuth';
import * as tokens from '../../../shared/styles/design-tokens';

// ============================================
// STYLED COMPONENTS
// ============================================

const LayoutContainer = styled.div<{ $focusMode: boolean }>`
  display: flex;
  height: 100vh;
  background: ${tokens.colors.white};
  color: ${tokens.colors.gray[800]};
  font-family: ${tokens.typography.fontFamily.sans};
  font-size: ${tokens.typography.fontSize.base};
  line-height: ${tokens.typography.lineHeight.normal};
  font-feature-settings: 'cv11', 'ss01', 'ss02', 'ss03', 'ss04';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  ${props => props.$focusMode && `
    .sidebar, .header {
      opacity: 0;
      pointer-events: none;
      transform: translateX(-100%);
      transition: all ${tokens.animations.duration.normal} ${tokens.animations.easing.inOut};
    }
  `}
`;

const ContentWrapper = styled.div<{ $collapsed: boolean; $focusMode: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: ${props => props.$focusMode ? '0' :
    (props.$collapsed ? tokens.layout.sidebar.collapsed : tokens.layout.sidebar.expanded)};
  transition: margin-left ${tokens.animations.duration.normal} ${tokens.animations.easing.inOut};
  overflow: hidden;
`;

const MainContent = styled.main<{ $focusMode: boolean }>`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  position: relative;

  ${props => props.$focusMode ? `
    padding: ${tokens.spacing[8]};
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  ` : `
    padding: ${tokens.spacing[6]};
  `}

  /* Custom Scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${tokens.colors.gray[300]};
    border-radius: ${tokens.borders.radius.full};
    transition: background ${tokens.animations.duration.fast};

    &:hover {
      background: ${tokens.colors.gray[400]};
    }
  }
`;

const KeyboardHint = styled.div`
  position: fixed;
  bottom: ${tokens.spacing[4]};
  right: ${tokens.spacing[4]};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  background: ${tokens.colors.black};
  color: ${tokens.colors.white};
  font-family: ${tokens.typography.fontFamily.mono};
  font-size: ${tokens.typography.fontSize.xs};
  font-weight: ${tokens.typography.fontWeight.medium};
  border-radius: ${tokens.borders.radius.md};
  opacity: 0;
  transform: translateY(10px);
  transition: all ${tokens.animations.duration.fast} ${tokens.animations.easing.out};
  pointer-events: none;
  z-index: ${tokens.zIndex.tooltip};

  &.visible {
    opacity: 1;
    transform: translateY(0);
  }
`;

const GridOverlay = styled.div<{ $visible: boolean }>`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: ${tokens.zIndex.negative};
  opacity: ${props => props.$visible ? 0.05 : 0};
  transition: opacity ${tokens.animations.duration.slow};

  background-image:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent ${tokens.spacing[8]},
      ${tokens.colors.gray[900]} ${tokens.spacing[8]},
      ${tokens.colors.gray[900]} calc(${tokens.spacing[8]} + 0.5px)
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent ${tokens.spacing[8]},
      ${tokens.colors.gray[900]} ${tokens.spacing[8]},
      ${tokens.colors.gray[900]} calc(${tokens.spacing[8]} + 0.5px)
    );
`;

// ============================================
// MAIN COMPONENT
// ============================================

export const MainLayout: React.FC = () => {
  const { user, profile } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [omnibarOpen, setOmnibarOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);

  // Keyboard shortcuts
  useKeyboard('cmd+k', () => setOmnibarOpen(true));
  useKeyboard('cmd+\\', () => setSidebarCollapsed(prev => !prev));
  useKeyboard('cmd+.', () => setFocusMode(prev => !prev));
  useKeyboard('cmd+g', () => setShowGrid(prev => !prev));
  useKeyboard('escape', () => {
    setOmnibarOpen(false);
    setFocusMode(false);
  });

  // Show keyboard hints on hover
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleMouseMove = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowKeyboardHint(false), 3000);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setShowKeyboardHint(true);
        clearTimeout(timeout);
        timeout = setTimeout(() => setShowKeyboardHint(false), 2000);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeout);
    };
  }, []);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const handleResize = () => {
      setSidebarCollapsed(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <LayoutContainer $focusMode={focusMode}>
      <GridOverlay $visible={showGrid} />

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
        className="sidebar"
      />

      <ContentWrapper
        $collapsed={sidebarCollapsed}
        $focusMode={focusMode}
      >
        <Header
          onOmnibarOpen={() => setOmnibarOpen(true)}
          onFocusMode={() => setFocusMode(prev => !prev)}
          focusMode={focusMode}
          className="header"
        />

        <MainContent $focusMode={focusMode}>
          <Outlet />
        </MainContent>
      </ContentWrapper>

      <Omnibar
        isOpen={omnibarOpen}
        onClose={() => setOmnibarOpen(false)}
      />

      {focusMode && <FocusMode onExit={() => setFocusMode(false)} />}

      <KeyboardHint className={showKeyboardHint ? 'visible' : ''}>
        <span>⌘K</span> Omnibar •
        <span>⌘\</span> Sidebar •
        <span>⌘.</span> Focus
      </KeyboardHint>
    </LayoutContainer>
  );
};

// ============================================
// EXPORTS
// ============================================

export default MainLayout;