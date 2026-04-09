/**
 * Add-ons Page
 * Browse, install, and manage add-ons.
 * Installing an add-on auto-creates its collections.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  Mail, Search, FileInput, CalendarCheck, Package,
  CheckCircle, Download, Trash2, ArrowRight, Loader, X, ExternalLink,
  Zap, Sparkles, CreditCard, Globe,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { ADDONS_REGISTRY, type AddonDefinition } from '../config/addons-registry';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useI18n } from '../lib/i18n';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`max-width: 1200px; animation: ${fadeIn} 0.4s ease-out;`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};
  h1 { font-size: ${typography.fontSize['3xl']}; font-weight: ${typography.fontWeight.bold}; margin: 0 0 ${spacing[2]}; color: ${colors.gray[900]}; }
  p { font-size: ${typography.fontSize.sm}; color: ${colors.gray[500]}; margin: 0; }
`;

const Tabs = styled.div`
  display: flex;
  gap: ${spacing[1]};
  margin-bottom: ${spacing[6]};
  background: ${colors.gray[100]};
  border-radius: ${borders.radius.lg};
  padding: 3px;
  width: fit-content;
`;

const Tab = styled.button<{ $active?: boolean }>`
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${borders.radius.md};
  border: none;
  background: ${p => p.$active ? colors.white : 'transparent'};
  box-shadow: ${p => p.$active ? shadows.sm : 'none'};
  color: ${p => p.$active ? colors.gray[900] : colors.gray[500]};
  font-weight: ${p => p.$active ? 600 : 500};
  font-size: ${typography.fontSize.sm};
  cursor: pointer;
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: ${spacing[5]};
`;

const AddonCard = styled.div<{ $installed?: boolean }>`
  background: ${colors.white};
  border: 1px solid ${p => p.$installed ? colors.accent[200] : colors.gray[200]};
  border-radius: ${borders.radius.xl};
  overflow: hidden;
  transition: all 0.2s;
  &:hover { border-color: ${colors.accent[300]}; box-shadow: ${shadows.lg}; transform: translateY(-2px); }
`;

const CardTop = styled.div<{ $color: string }>`
  height: 6px;
  background: ${p => p.$color};
`;

const CardBody = styled.div`
  padding: ${spacing[5]};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[4]};

  .addon-icon {
    width: 48px; height: 48px;
    border-radius: ${borders.radius.lg};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    svg { width: 24px; height: 24px; }
  }

  .addon-info { flex: 1; }
  .addon-name { font-size: ${typography.fontSize.lg}; font-weight: ${typography.fontWeight.semibold}; color: ${colors.gray[900]}; margin-bottom: 2px; }
  .addon-meta { font-size: 12px; color: ${colors.gray[500]}; display: flex; gap: ${spacing[3]}; }
  .addon-badge {
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
  }
`;

const CardDesc = styled.p`
  font-size: ${typography.fontSize.sm};
  color: ${colors.gray[600]};
  line-height: 1.6;
  margin: 0 0 ${spacing[4]};
`;

const CardCollections = styled.div`
  margin-bottom: ${spacing[4]};
  .cc-label { font-size: 12px; font-weight: 600; color: ${colors.gray[500]}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: ${spacing[2]}; }
  .cc-list { display: flex; flex-wrap: wrap; gap: ${spacing[2]}; }
  .cc-item {
    padding: 4px 10px;
    background: ${colors.gray[100]};
    border-radius: ${borders.radius.md};
    font-size: 12px;
    color: ${colors.gray[700]};
    font-weight: 500;
  }
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${spacing[4]};
  border-top: 1px solid ${colors.gray[100]};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' }>`
  padding: ${spacing[2.5]} ${spacing[4]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  border: none;
  svg { width: 16px; height: 16px; }

  ${p => p.$variant === 'primary' ? `
    background: ${colors.accent[500]};
    color: #fff;
    &:hover { background: ${colors.accent[600]}; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  ` : p.$variant === 'danger' ? `
    background: none;
    color: ${colors.red[600]};
    border: 1px solid ${colors.red[200]};
    &:hover { background: ${colors.red[50]}; }
  ` : `
    background: ${colors.gray[100]};
    color: ${colors.gray[700]};
    &:hover { background: ${colors.gray[200]}; }
  `}
`;

const InstalledBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  font-weight: 600;
  color: #16a34a;
  svg { width: 18px; height: 18px; }
`;

const ICON_MAP: Record<string, any> = {
  'mail': Mail,
  'search': Search,
  'file-input': FileInput,
  'calendar-check': CalendarCheck,
  'arrow-right': ArrowRight,
  'zap': Zap,
  'sparkles': Sparkles,
  'credit-card': CreditCard,
  'globe': Globe,
};

// ============================================
// COMPONENT
// ============================================

export const Addons = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'all' | 'installed'>('all');
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkInstalled();
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, []);

  const checkInstalled = async () => {
    try {
      const { data: collections } = await api.getCollections();
      const existingSlugs = new Set((collections || []).map((c: any) => c.slug));
      const installed = new Set<string>();

      for (const addon of ADDONS_REGISTRY) {
        if (addon.collections.length > 0 && existingSlugs.has(addon.collections[0].slug)) {
          installed.add(addon.id);
        }
      }

      setInstalledIds(installed);
    } catch (err) {
      console.error('Error checking addons:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (addon: AddonDefinition) => {
    setInstalling(addon.id);

    try {
      for (const col of addon.collections) {
        const { error } = await api.createCollection({
          name: col.name, slug: col.slug, description: col.description,
          type: col.type, fields: col.fields,
        });
        // Ignore errors for existing collections
        if (error && !error.includes('already exists')) throw new Error(error);
      }

      setInstalledIds(prev => new Set([...prev, addon.id]));
    } catch (err: any) {
      toast.error('Failed to install: ' + (err.message || 'Unknown error'));
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (addon: AddonDefinition) => {
    if (!confirm(`Uninstall "${addon.name}"? This will DELETE all its collections and data.`)) return;
    setInstalling(addon.id);

    try {
      for (const col of addon.collections) {
        await api.deleteCollection(col.slug);
      }
      setInstalledIds(prev => {
        const next = new Set(prev);
        next.delete(addon.id);
        return next;
      });
    } catch (err: any) {
      toast.error('Failed to uninstall: ' + (err.message || 'Unknown error'));
    } finally {
      setInstalling(null);
    }
  };

  const displayAddons = tab === 'installed'
    ? ADDONS_REGISTRY.filter(a => installedIds.has(a.id))
    : ADDONS_REGISTRY;

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case 'marketing': return 'Marketing';
      case 'content': return 'Content';
      case 'commerce': return 'Commerce';
      case 'tools': return 'Tools';
      default: return cat;
    }
  };

  return (
    <Container>
      <Header>
        <h1>{t('addons.title')}</h1>
        <p>{t('addons.subtitle')}</p>
      </Header>

      <Tabs>
        <Tab $active={tab === 'all'} onClick={() => setTab('all')}>{t('addons.allAddons')} ({ADDONS_REGISTRY.length})</Tab>
        <Tab $active={tab === 'installed'} onClick={() => setTab('installed')}>{t('addons.installed')} ({installedIds.size})</Tab>
      </Tabs>

      <Grid>
        {displayAddons.map(addon => {
          const Icon = ICON_MAP[addon.icon] || Package;
          const isInstalled = installedIds.has(addon.id);
          const isInstalling = installing === addon.id;

          return (
            <AddonCard key={addon.id} $installed={isInstalled}>
              <CardTop $color={addon.color} />
              <CardBody>
                <CardHeader>
                  <div className="addon-icon" style={{ background: addon.color + '15', color: addon.color }}>
                    <Icon />
                  </div>
                  <div className="addon-info">
                    <div className="addon-name">{addon.name}</div>
                    <div className="addon-meta">
                      <span className="addon-badge" style={{ background: colors.gray[100], color: colors.gray[600] }}>{categoryLabel(addon.category)}</span>
                      <span>v{addon.version}</span>
                      <span>{addon.author}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardDesc>{addon.longDescription}</CardDesc>

                <CardCollections>
                  <div className="cc-label">Creates collections</div>
                  <div className="cc-list">
                    {addon.collections.map(col => (
                      <span key={col.slug} className="cc-item">{col.name}</span>
                    ))}
                  </div>
                </CardCollections>

                <CardFooter>
                  {isInstalled ? (
                    <>
                      <InstalledBadge><CheckCircle /> Installed</InstalledBadge>
                      <div style={{ display: 'flex', gap: spacing[2] }}>
                        <Btn $variant="ghost" onClick={() => navigate(addon.id === 'bookings' ? '/bookings' : `/content/${addon.collections[0].slug}`)}>
                          Open <ArrowRight />
                        </Btn>
                        <Btn $variant="danger" onClick={() => handleUninstall(addon)} disabled={isInstalling}>
                          <Trash2 /> Uninstall
                        </Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, color: colors.gray[400] }}>
                        {addon.collections.reduce((sum, c) => sum + c.fields.length, 0)} fields
                      </span>
                      <Btn $variant="primary" onClick={() => handleInstall(addon)} disabled={isInstalling}>
                        {isInstalling ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Installing...</> : <><Download /> Install</>}
                      </Btn>
                    </>
                  )}
                </CardFooter>
              </CardBody>
            </AddonCard>
          );
        })}
      </Grid>

      {tab === 'installed' && installedIds.size === 0 && (
        <div style={{ textAlign: 'center', padding: `${spacing[12]} ${spacing[4]}`, color: colors.gray[400] }}>
          <Package size={48} style={{ marginBottom: spacing[4] }} />
          <p style={{ fontSize: typography.fontSize.base, fontWeight: 500, color: colors.gray[600], marginBottom: spacing[2] }}>No add-ons installed</p>
          <p style={{ fontSize: typography.fontSize.sm }}>Browse available add-ons and install with one click</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};
