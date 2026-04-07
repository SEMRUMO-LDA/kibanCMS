import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../features/auth/hooks/useAuth';
import { CommandPalette } from '../components/CommandPalette';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import {
  Building2,
  LayoutDashboard,
  Files,
  Image as ImageIcon,
  Users,
  Settings,
  LogOut,
  Menu,
  Command,
  Puzzle,
  Activity,
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

const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
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

const Sidebar = styled.aside<{ $isOpen: boolean }>`
  width: ${layout.sidebar.expanded};
  background: ${colors.white};
  border-right: 1px solid ${colors.gray[200]};
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100;
  transition: transform ${animations.duration.normal} ${animations.easing.out};

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    box-shadow: ${props => props.$isOpen ? shadows['2xl'] : 'none'};
    transform: ${props => props.$isOpen ? 'translateX(0)' : 'translateX(-100%)'};
    animation: ${props => props.$isOpen ? slideInLeft : 'none'} ${animations.duration.normal} ${animations.easing.out};
  }
`;

const LogoSection = styled.div`
  height: ${layout.header.height};
  display: flex;
  align-items: center;
  padding: 0 ${spacing[6]};
  gap: ${spacing[3]};
  border-bottom: 1px solid ${colors.gray[200]};
  background: ${colors.white};

  .logo-icon {
    flex-shrink: 0;
    transition: transform ${animations.duration.fast} ${animations.easing.spring};

    &:hover {
      transform: scale(1.05) rotate(-5deg);
    }
  }

  h1 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.bold};
    margin: 0;
    letter-spacing: ${typography.letterSpacing.tight};
    color: ${colors.gray[900]};
    line-height: 1;
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

const NavLabel = styled.div`
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: ${typography.letterSpacing.wider};
  color: ${colors.gray[500]};
  padding: 0 ${spacing[3]};
  margin-bottom: ${spacing[2]};
`;

const NavItem = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[3]};
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
  }

  /* Keyboard focus indicator */
  &:focus-visible {
    outline: 2px solid ${colors.accent[500]};
    outline-offset: 2px;
  }
`;

const UserSection = styled.div`
  padding: ${spacing[4]} ${spacing[4]};
  border-top: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  background: ${colors.gray[50]};

  .user-avatar {
    width: 40px;
    height: 40px;
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
    display: flex;
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

const SearchHint = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[3]};
  margin: 0 ${spacing[4]} ${spacing[4]};
  background: ${colors.gray[100]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[600]};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${colors.gray[200]};
    border-color: ${colors.gray[300]};
  }

  kbd {
    padding: ${spacing[1]} ${spacing[2]};
    background: ${colors.white};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.sm};
    font-size: ${typography.fontSize['2xs']};
    font-family: ${typography.fontFamily.mono};
    box-shadow: ${shadows.xs};
  }
`;

// ============================================
// COMPONENT
// ============================================

export const DashboardLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const { user, profile, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  // Load collections for sidebar
  useEffect(() => {
    api.getCollections().then(({ data }) => setCollections(data || [])).catch(() => {});
  }, []);

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
          <img src="/logo.jpg" alt="kibanCMS" style={{ height: '24px', objectFit: 'contain' }} />
          <h1>kibanCMS</h1>
        </div>
      </MobileHeader>

      <Overlay $isOpen={mobileMenuOpen} onClick={() => setMobileMenuOpen(false)} />

      <Sidebar $isOpen={mobileMenuOpen}>
        <LogoSection>
          <img src="/logo.jpg" alt="kibanCMS" style={{ height: '28px', objectFit: 'contain' }} className="logo-icon" />
          <h1>kibanCMS</h1>
        </LogoSection>

        <SearchHint onClick={() => setCommandPaletteOpen(true)}>
          <Command size={14} />
          <span>{t('nav.quickSearch')}</span>
          <kbd>⌘K</kbd>
        </SearchHint>

        <Nav>
          <NavSection>
            <NavLabel>{t('nav.main')}</NavLabel>
            <NavItem $active={location.pathname === '/'} onClick={() => handleNavigation('/')} role="button" tabIndex={0}>
              <LayoutDashboard size={20} />
              <span>{t('nav.dashboard')}</span>
            </NavItem>
            <NavItem $active={location.pathname === '/content'} onClick={() => handleNavigation('/content')} role="button" tabIndex={0}>
              <Files size={20} />
              <span>{t('nav.content')}</span>
            </NavItem>

            {/* Dynamic collections */}
            {collections.map(col => (
              <NavItem
                key={col.slug}
                $active={location.pathname === `/content/${col.slug}`}
                onClick={() => handleNavigation(`/content/${col.slug}`)}
                role="button" tabIndex={0}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${location.pathname === `/content/${col.slug}` ? colors.accent[500] : colors.gray[300]}`, flexShrink: 0, marginLeft: spacing[2] }} />
                <span>{col.name}</span>
              </NavItem>
            ))}

            <NavItem $active={location.pathname.startsWith('/media')} onClick={() => handleNavigation('/media')} role="button" tabIndex={0}>
              <ImageIcon size={20} />
              <span>{t('nav.media')}</span>
            </NavItem>
          </NavSection>

          <NavSection>
            <NavLabel>{t('nav.system')}</NavLabel>
            <NavItem $active={location.pathname.startsWith('/users')} onClick={() => handleNavigation('/users')} role="button" tabIndex={0}>
              <Users size={20} /><span>{t('nav.users')}</span>
            </NavItem>
            <NavItem $active={location.pathname === '/activity'} onClick={() => handleNavigation('/activity')} role="button" tabIndex={0}>
              <Activity size={20} /><span>{t('nav.activity')}</span>
            </NavItem>
            <NavItem $active={location.pathname.startsWith('/addons')} onClick={() => handleNavigation('/addons')} role="button" tabIndex={0}>
              <Puzzle size={20} /><span>{t('nav.addons')}</span>
            </NavItem>
            <NavItem
              $active={location.pathname.startsWith('/settings')}
              onClick={() => handleNavigation('/settings')}
              role="button"
              tabIndex={0}
            >
              <Settings size={20} />
              <span>Settings</span>
            </NavItem>
          </NavSection>
        </Nav>

        <UserSection>
          <div className="user-avatar">{getUserInitials()}</div>
          <div className="user-info">
            <strong>{profile?.full_name || 'Admin User'}</strong>
            <span>{user?.email}</span>
          </div>
          <LogoutBtn onClick={handleLogout} title={t('nav.signOut')} aria-label="Sign out">
            <LogOut size={18} />
          </LogoutBtn>
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
