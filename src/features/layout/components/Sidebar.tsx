/**
 * Sidebar Component - Minimalist Navigation
 * Collapsible, keyboard-accessible, monochrome design
 */

import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import * as tokens from '../../../shared/styles/design-tokens';

// ============================================
// TYPES
// ============================================

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: MenuItem[];
  badge?: number;
  shortcut?: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

// ============================================
// STYLED COMPONENTS
// ============================================

const SidebarContainer = styled.aside<{ $collapsed: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: ${props => props.$collapsed ? tokens.layout.sidebar.collapsed : tokens.layout.sidebar.expanded};
  background: ${tokens.colors.white};
  border-right: ${tokens.borders.width.hairline} solid ${tokens.colors.gray[200]};
  display: flex;
  flex-direction: column;
  transition: width ${tokens.animations.duration.normal} ${tokens.animations.easing.inOut};
  z-index: ${tokens.zIndex.sticky};
  overflow: hidden;
`;

const Logo = styled.div<{ $collapsed: boolean }>`
  height: ${tokens.layout.header.height};
  padding: 0 ${tokens.spacing[4]};
  display: flex;
  align-items: center;
  border-bottom: ${tokens.borders.width.hairline} solid ${tokens.colors.gray[200]};

  .logo-mark {
    width: 32px;
    height: 32px;
    background: ${tokens.colors.black};
    border-radius: ${tokens.borders.radius.md};
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: ${tokens.typography.fontWeight.black};
    color: ${tokens.colors.white};
    font-size: ${tokens.typography.fontSize.lg};
    flex-shrink: 0;
  }

  .logo-text {
    margin-left: ${tokens.spacing[3]};
    font-weight: ${tokens.typography.fontWeight.bold};
    font-size: ${tokens.typography.fontSize.lg};
    letter-spacing: ${tokens.typography.letterSpacing.tight};
    opacity: ${props => props.$collapsed ? 0 : 1};
    transform: translateX(${props => props.$collapsed ? '-10px' : '0'});
    transition: all ${tokens.animations.duration.normal} ${tokens.animations.easing.inOut};
  }
`;

const Navigation = styled.nav`
  flex: 1;
  padding: ${tokens.spacing[4]} 0;
  overflow-y: auto;
  overflow-x: hidden;

  /* Hide scrollbar */
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
`;

const MenuGroup = styled.div`
  margin-bottom: ${tokens.spacing[6]};
`;

const GroupLabel = styled.div<{ $collapsed: boolean }>`
  padding: 0 ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[2]};
  font-size: ${tokens.typography.fontSize.xs};
  font-weight: ${tokens.typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: ${tokens.typography.letterSpacing.wider};
  color: ${tokens.colors.gray[500]};
  opacity: ${props => props.$collapsed ? 0 : 1};
  transition: opacity ${tokens.animations.duration.fast};
  height: ${props => props.$collapsed ? '0' : 'auto'};
  overflow: hidden;
`;

const MenuItem = styled(NavLink)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  color: ${tokens.colors.gray[700]};
  text-decoration: none;
  font-size: ${tokens.typography.fontSize.sm};
  font-weight: ${tokens.typography.fontWeight.medium};
  position: relative;
  transition: all ${tokens.animations.duration.fast} ${tokens.animations.easing.out};

  &:hover {
    background: ${tokens.colors.gray[50]};
    color: ${tokens.colors.black};
  }

  &.active {
    color: ${tokens.colors.black};
    font-weight: ${tokens.typography.fontWeight.semibold};

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 24px;
      background: ${tokens.colors.black};
      border-radius: 0 ${tokens.borders.radius.sm} ${tokens.borders.radius.sm} 0;
    }
  }

  .icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .label {
    margin-left: ${tokens.spacing[3]};
    opacity: ${props => props.$collapsed ? 0 : 1};
    transform: translateX(${props => props.$collapsed ? '-10px' : '0'});
    transition: all ${tokens.animations.duration.normal} ${tokens.animations.easing.inOut};
    flex: 1;
  }

  .badge {
    background: ${tokens.colors.gray[900]};
    color: ${tokens.colors.white};
    padding: ${tokens.spacing[0.5]} ${tokens.spacing[2]};
    border-radius: ${tokens.borders.radius.full};
    font-size: ${tokens.typography.fontSize['2xs']};
    font-weight: ${tokens.typography.fontWeight.bold};
    opacity: ${props => props.$collapsed ? 0 : 1};
    transition: opacity ${tokens.animations.duration.fast};
  }

  .shortcut {
    margin-left: auto;
    padding: ${tokens.spacing[0.5]} ${tokens.spacing[1]};
    background: ${tokens.colors.gray[100]};
    border-radius: ${tokens.borders.radius.xs};
    font-family: ${tokens.typography.fontFamily.mono};
    font-size: ${tokens.typography.fontSize['2xs']};
    color: ${tokens.colors.gray[600]};
    opacity: ${props => props.$collapsed ? 0 : 1};
    transition: opacity ${tokens.animations.duration.fast};
  }
`;

const Footer = styled.div<{ $collapsed: boolean }>`
  padding: ${tokens.spacing[4]};
  border-top: ${tokens.borders.width.hairline} solid ${tokens.colors.gray[200]};
`;

const CollapseButton = styled.button`
  width: 100%;
  padding: ${tokens.spacing[2]};
  background: transparent;
  border: ${tokens.borders.width.thin} solid ${tokens.colors.gray[200]};
  border-radius: ${tokens.borders.radius.md};
  color: ${tokens.colors.gray[700]};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${tokens.typography.fontSize.sm};
  font-weight: ${tokens.typography.fontWeight.medium};
  transition: all ${tokens.animations.duration.fast};

  &:hover {
    background: ${tokens.colors.gray[50]};
    border-color: ${tokens.colors.gray[300]};
    color: ${tokens.colors.black};
  }

  &:focus {
    outline: none;
    box-shadow: ${tokens.shadows.focus};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  className,
}) => {
  const location = useLocation();

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '◐',
      path: '/dashboard',
      shortcut: '⌘D',
    },
    {
      id: 'content',
      label: 'Content',
      icon: '☐',
      path: '/content',
      badge: 12,
    },
    {
      id: 'media',
      label: 'Media',
      icon: '◧',
      path: '/media',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '◔',
      path: '/analytics',
    },
  ];

  const bottomItems: MenuItem[] = [
    {
      id: 'settings',
      label: 'Settings',
      icon: '◉',
      path: '/settings',
      shortcut: '⌘,',
    },
    {
      id: 'help',
      label: 'Help',
      icon: '?',
      path: '/help',
      shortcut: '⌘/',
    },
  ];

  return (
    <SidebarContainer $collapsed={collapsed} className={className}>
      <Logo $collapsed={collapsed}>
        <div className="logo-mark">K</div>
        <div className="logo-text">kibanCMS</div>
      </Logo>

      <Navigation>
        <MenuGroup>
          <GroupLabel $collapsed={collapsed}>Main</GroupLabel>
          {menuItems.map(item => (
            <MenuItem
              key={item.id}
              to={item.path || '#'}
              $collapsed={collapsed}
            >
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label}</span>
              {item.badge && <span className="badge">{item.badge}</span>}
              {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
            </MenuItem>
          ))}
        </MenuGroup>

        <MenuGroup>
          <GroupLabel $collapsed={collapsed}>System</GroupLabel>
          {bottomItems.map(item => (
            <MenuItem
              key={item.id}
              to={item.path || '#'}
              $collapsed={collapsed}
            >
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label}</span>
              {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
            </MenuItem>
          ))}
        </MenuGroup>
      </Navigation>

      <Footer $collapsed={collapsed}>
        <CollapseButton onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? '→' : '←'}
        </CollapseButton>
      </Footer>
    </SidebarContainer>
  );
};

export default Sidebar;