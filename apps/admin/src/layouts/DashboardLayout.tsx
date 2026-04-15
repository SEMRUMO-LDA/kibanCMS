import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../features/auth/hooks/useAuth';
import { CommandPalette } from '../components/CommandPalette';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import {
  LayoutDashboard,
  Files,
  Image as ImageIcon,
  Users,
  Settings,
  LogOut,
  Menu,
  Search,
  Puzzle,
  Activity,
  CalendarCheck,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations, layout } from '../shared/styles/design-tokens';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideInLeft = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  display: flex;
  height: 100vh;
  background: ${colors.white};
  color: ${colors.gray[900]};
  position: relative;
  overflow: hidden;
  font-family: ${typography.fontFamily.sans};
`;

const Sidebar = styled.aside<{ $isOpen: boolean; $collapsed: boolean }>`
  width: ${p => p.$collapsed ? layout.sidebar.collapsed : layout.sidebar.expanded};
  background: ${colors.white};
  border-right: 1px solid ${colors.gray[200]};
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100;
  transition: width 0.2s ease-out, transform ${animations.duration.normal} ${animations.easing.out};

  @media (max-width: 768px) {
    width: ${layout.sidebar.expanded};
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    box-shadow: ${props => props.$isOpen ? shadows['2xl'] : 'none'};
    transform: ${props => props.$isOpen ? 'translateX(0)' : 'translateX(-100%)'};
    animation: ${props => props.$isOpen ? slideInLeft : 'none'} ${animations.duration.normal} ${animations.easing.out};
  }
`;

const LogoSection = styled.div<{ $collapsed?: boolean }>`
  padding: ${spacing[5]} ${p => p.$collapsed ? spacing[3] : spacing[5]};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  border-bottom: 1px solid ${colors.gray[100]};
  background: ${colors.white};
  justify-content: ${p => p.$collapsed ? 'center' : 'flex-start'};

  .logo-icon {
    flex-shrink: 0;
    transition: transform ${animations.duration.fast} ${animations.easing.spring};
    &:hover { transform: scale(1.05) rotate(-3deg); }
  }

  .logo-text {
    display: ${p => p.$collapsed ? 'none' : 'flex'};
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }

  h1 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.bold};
    color: ${colors.gray[900]};
    margin: 0;
    line-height: 1.2;
  }

  .version {
    font-size: 10px;
    color: ${colors.gray[400]};
    font-weight: 500;
    letter-spacing: 0.03em;
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${spacing[6]} ${spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[1]};
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${colors.gray[300]};
    border-radius: ${borders.radius.full};
  }
`;

const NavSection = styled.div`
  margin-bottom: ${spacing[6]};

  &:last-child {
    margin-bottom: 0;
  }
`;

const NavLabel = styled.div<{ $collapsed?: boolean }>`
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: ${typography.letterSpacing.wider};
  color: ${colors.gray[400]};
  padding: 0 ${spacing[3]};
  margin-bottom: ${spacing[2]};
  display: ${p => p.$collapsed ? 'none' : 'block'};
`;

const NavItem = styled.div<{ $active?: boolean; $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${p => p.$collapsed ? 'center' : 'flex-start'};
  gap: ${p => p.$collapsed ? '0' : spacing[3]};
  padding: ${p => p.$collapsed ? spacing[3] : `${spacing[3]} ${spacing[3]}`};
  border-radius: ${borders.radius.lg};
  cursor: pointer;
  color: ${props => props.$active ? colors.gray[900] : colors.gray[600]};
  background: ${props => props.$active ? colors.accent[50] : 'transparent'};
  font-weight: ${props => props.$active ? typography.fontWeight.semibold : typography.fontWeight.medium};
  font-size: ${typography.fontSize.sm};
  position: relative;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  user-select: none;

  /* Active indicator */
  ${props => props.$active && `
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 60%;
      background: ${colors.accent[500]};
      border-radius: 0 ${borders.radius.sm} ${borders.radius.sm} 0;
    }
  `}

  &:hover {
    background: ${props => props.$active ? colors.accent[100] : colors.gray[100]};
    color: ${colors.gray[900]};
    transform: translateX(2px);
  }

  &:active {
    transform: translateX(1px) scale(0.98);
  }

  svg {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    color: ${props => props.$active ? colors.accent[500] : 'currentColor'};
    transition: color ${animations.duration.fast} ${animations.easing.out};
  }

  span {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: ${(p: any) => p.$collapsed ? 'none' : 'block'};
  }

  /* Keyboard focus indicator */
  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }
`;

const CollapseBtn = styled.button<{ $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  padding: ${spacing[2]};
  margin: 0 ${p => p.$collapsed ? spacing[2] : spacing[4]} ${spacing[2]};
  background: none;
  border: 1px solid transparent;
  border-radius: ${borders.radius.md};
  color: ${colors.gray[400]};
  cursor: pointer;
  font-size: 12px;
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;

  &:hover {
    background: ${colors.gray[50]};
    border-color: ${colors.gray[200]};
    color: ${colors.gray[600]};
  }

  svg { width: 16px; height: 16px; flex-shrink: 0; }
  span { display: ${p => p.$collapsed ? 'none' : 'inline'}; }
`;

const UserSection = styled.div<{ $collapsed?: boolean }>`
  padding: ${p => p.$collapsed ? `${spacing[3]} ${spacing[2]}` : `${spacing[4]} ${spacing[4]}`};
  border-top: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: ${p => p.$collapsed ? 'center' : 'flex-start'};
  gap: ${spacing[3]};
  background: ${colors.gray[50]};

  .user-avatar {
    width: ${p => p.$collapsed ? '36px' : '40px'};
    height: ${p => p.$collapsed ? '36px' : '40px'};
    border-radius: ${borders.radius.full};
    background: linear-gradient(135deg, ${colors.accent[400]}, ${colors.accent[600]});
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.white};
    font-weight: ${typography.fontWeight.semibold};
    font-size: ${typography.fontSize.sm};
    flex-shrink: 0;
    box-shadow: ${shadows.sm};
  }

  .user-info {
    flex: 1;
    overflow: hidden;
    display: ${p => p.$collapsed ? 'none' : 'flex'};
    flex-direction: column;
    gap: ${spacing[0.5]};
    min-width: 0;

    strong {
      font-size: ${typography.fontSize.sm};
      font-weight: ${typography.fontWeight.semibold};
      color: ${colors.gray[900]};
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    span {
      font-size: ${typography.fontSize.xs};
      color: ${colors.gray[600]};
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
  }
`;

const LogoutBtn = styled.button`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  color: ${colors.gray[600]};
  cursor: pointer;
  padding: ${spacing[2]};
  border-radius: ${borders.radius.md};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  flex-shrink: 0;

  &:hover {
    background: ${colors.gray[100]};
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

const MainContent = styled.main`
  flex: 1;
  overflow-y: auto;
  background: ${colors.gray[50]};
  position: relative;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${colors.gray[300]};
    border-radius: ${borders.radius.md};
  }
  &::-webkit-scrollbar-thumb:hover {
    background: ${colors.gray[400]};
  }
`;

const ContentWrapper = styled.div`
  max-width: 1600px;
  margin: 0 auto;
  padding: ${spacing[8]} ${spacing[8]};
  animation: ${fadeIn} ${animations.duration.normal} ${animations.easing.out};

  @media (max-width: 768px) {
    padding: ${spacing[6]} ${spacing[4]};
  }
`;

const MobileHeader = styled.div`
  display: none;
  height: ${layout.header.height};
  align-items: center;
  justify-content: space-between;
  padding: 0 ${spacing[4]};
  background: ${colors.white};
  border-bottom: 1px solid ${colors.gray[200]};
  position: sticky;
  top: 0;
  z-index: 90;

  @media (max-width: 768px) {
    display: flex;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: ${spacing[3]};
  }

  button {
    background: none;
    border: none;
    color: ${colors.gray[900]};
    cursor: pointer;
    padding: ${spacing[2]};
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: ${borders.radius.md};

    &:hover {
      background: ${colors.gray[100]};
    }

    &:active {
      transform: scale(0.95);
    }
  }

  h1 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.bold};
    margin: 0;
    color: ${colors.gray[900]};
  }
`;

const Overlay = styled.div<{ $isOpen: boolean }>`
  display: none;

  @media (max-width: 768px) {
    display: ${props => props.$isOpen ? 'block' : 'none'};
    position: fixed;
    inset: 0;
    background: ${colors.backdrop};
    backdrop-filter: blur(4px);
    z-index: 90;
    animation: ${fadeIn} ${animations.duration.fast} ${animations.easing.out};
  }
`;

const SearchHint = styled.div<{ $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${p => p.$collapsed ? 'center' : 'flex-start'};
  gap: ${spacing[2.5]};
  padding: ${p => p.$collapsed ? spacing[2.5] : `${spacing[2.5]} ${spacing[3.5]}`};
  margin: ${spacing[2]} ${p => p.$collapsed ? spacing[2] : spacing[4]} ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[500]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.white};
    border-color: ${colors.accent[300]};
    color: ${colors.gray[700]};
    box-shadow: 0 0 0 3px ${colors.accent[50]};
  }

  svg { flex-shrink: 0; }

  span {
    flex: 1;
    display: ${p => p.$collapsed ? 'none' : 'block'};
  }

  kbd {
    display: ${p => p.$collapsed ? 'none' : 'inline-flex'};
    padding: 2px 6px;
    background: ${colors.white};
    border: 1px solid ${colors.gray[200]};
    border-radius: ${borders.radius.sm};
    font-size: 10px;
    font-family: ${typography.fontFamily.mono};
    color: ${colors.gray[400]};
    line-height: 1.4;
  }
`;

// ============================================
// COMPONENT
// ============================================

export const DashboardLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('kiban-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [hasBookings, setHasBookings] = useState(false);
  const { user, profile, signOut } = useAuth();

  // Check if bookings addon is installed
  useEffect(() => {
    api.getCollections().then(({ data }) => {
      if (data) {
        const slugs = new Set(data.map((c: any) => c.slug));
        setHasBookings(slugs.has('tours') || slugs.has('bookings'));
      }
    }).catch(() => {});
  }, []);
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('kiban-sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const getUserInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  return (
    <Container>
      <MobileHeader>
        <div className="header-left">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
            <Menu size={20} />
          </button>
          <img src="/logo.png" alt="kibanCMS" style={{ height: '24px', objectFit: 'contain' }} />
          <h1>kibanCMS</h1>
        </div>
      </MobileHeader>

      <Overlay $isOpen={mobileMenuOpen} onClick={() => setMobileMenuOpen(false)} />

      <Sidebar $isOpen={mobileMenuOpen} $collapsed={collapsed}>
        <LogoSection $collapsed={collapsed}>
          <img src="/logo.png" alt="kibanCMS" style={{ height: collapsed ? '32px' : '40px', objectFit: 'contain' }} className="logo-icon" />
          <div className="logo-text">
            <h1>kibanCMS</h1>
            <span className="version">v1.5.0</span>
          </div>
        </LogoSection>

        <SearchHint $collapsed={collapsed} onClick={() => setCommandPaletteOpen(true)}>
          <Search size={16} />
          <span>Search...</span>
          <kbd>⌘K</kbd>
        </SearchHint>

        <Nav>
          <NavSection>
            <NavLabel $collapsed={collapsed}>{t('nav.main')}</NavLabel>
            <NavItem $active={location.pathname === '/'} $collapsed={collapsed} onClick={() => handleNavigation('/')} role="button" tabIndex={0} title={collapsed ? t('nav.dashboard') : undefined}>
              <LayoutDashboard size={20} />
              <span>{t('nav.dashboard')}</span>
            </NavItem>
            <NavItem $active={location.pathname === '/content' || location.pathname.startsWith('/content/')} $collapsed={collapsed} onClick={() => handleNavigation('/content')} role="button" tabIndex={0} title={collapsed ? t('nav.content') : undefined}>
              <Files size={20} />
              <span>{t('nav.content')}</span>
            </NavItem>
            <NavItem $active={location.pathname.startsWith('/media')} $collapsed={collapsed} onClick={() => handleNavigation('/media')} role="button" tabIndex={0} title={collapsed ? t('nav.media') : undefined}>
              <ImageIcon size={20} />
              <span>{t('nav.media')}</span>
            </NavItem>
            {hasBookings && (
              <NavItem $active={location.pathname === '/bookings'} $collapsed={collapsed} onClick={() => handleNavigation('/bookings')} role="button" tabIndex={0} title={collapsed ? 'Bookings' : undefined}>
                <CalendarCheck size={20} />
                <span>Bookings</span>
              </NavItem>
            )}
          </NavSection>

          <NavSection>
            <NavLabel $collapsed={collapsed}>{t('nav.system')}</NavLabel>
            <NavItem $active={location.pathname.startsWith('/users')} $collapsed={collapsed} onClick={() => handleNavigation('/users')} role="button" tabIndex={0} title={collapsed ? t('nav.users') : undefined}>
              <Users size={20} /><span>{t('nav.users')}</span>
            </NavItem>
            <NavItem $active={location.pathname === '/activity'} $collapsed={collapsed} onClick={() => handleNavigation('/activity')} role="button" tabIndex={0} title={collapsed ? t('nav.activity') : undefined}>
              <Activity size={20} /><span>{t('nav.activity')}</span>
            </NavItem>
            <NavItem $active={location.pathname.startsWith('/addons')} $collapsed={collapsed} onClick={() => handleNavigation('/addons')} role="button" tabIndex={0} title={collapsed ? t('nav.addons') : undefined}>
              <Puzzle size={20} /><span>{t('nav.addons')}</span>
            </NavItem>
            <NavItem $active={location.pathname.startsWith('/settings')} $collapsed={collapsed} onClick={() => handleNavigation('/settings')} role="button" tabIndex={0} title={collapsed ? 'Settings' : undefined}>
              <Settings size={20} />
              <span>Settings</span>
            </NavItem>
          </NavSection>
        </Nav>

        <CollapseBtn $collapsed={collapsed} onClick={toggleCollapse}>
          {collapsed ? <ChevronsRight /> : <><ChevronsLeft /><span>Collapse</span></>}
        </CollapseBtn>

        <UserSection $collapsed={collapsed}>
          <div className="user-avatar">{getUserInitials()}</div>
          <div className="user-info">
            <strong>{profile?.full_name || user?.email?.split('@')[0] || 'User'}</strong>
            <span>{user?.email}</span>
          </div>
          {!collapsed && (
            <LogoutBtn onClick={handleLogout} title={t('nav.signOut')} aria-label="Sign out">
              <LogOut size={18} />
            </LogoutBtn>
          )}
        </UserSection>
      </Sidebar>

      <MainContent>
        <ContentWrapper>
          <Outlet />
        </ContentWrapper>
      </MainContent>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </Container>
  );
};
