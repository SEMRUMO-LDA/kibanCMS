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
  Zap, Sparkles, CreditCard, Globe, Cookie, Accessibility, Power, PowerOff, RefreshCw,
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { useToast } from '../components/Toast';
import { ADDONS_REGISTRY, type AddonDefinition } from '../config/addons-registry';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
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
  padding-top: ${spacing[4]};
  border-top: 1px solid ${colors.gray[100]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${spacing[2]};
`;

const SecondaryActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost'; $size?: 'sm' | 'md' }>`
  padding: ${p => p.$size === 'sm' ? `${spacing[1.5]} ${spacing[3]}` : `${spacing[2.5]} ${spacing[4]}`};
  border-radius: ${borders.radius.md};
  font-size: ${p => p.$size === 'sm' ? '12px' : typography.fontSize.sm};
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[1.5]};
  font-family: ${typography.fontFamily.sans};
  transition: all 0.15s;
  border: none;
  white-space: nowrap;
  svg { width: ${p => p.$size === 'sm' ? '13px' : '16px'}; height: ${p => p.$size === 'sm' ? '13px' : '16px'}; }

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
    background: ${colors.gray[50]};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[200]};
    &:hover { background: ${colors.gray[100]}; border-color: ${colors.gray[300]}; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  `}
`;

const InstalledBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1.5]};
  padding: 3px 10px;
  background: #dcfce7;
  color: #15803d;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  svg { width: 13px; height: 13px; }
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
  'cookie': Cookie,
  'accessibility': Accessibility,
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
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingStripe, setTestingStripe] = useState(false);

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
      const disabled = new Set<string>();

      // Check widget addon states from addon_configs
      const supabase = getSupabase();
      if (supabase) {
        const { data: configs } = await supabase.from('addon_configs').select('addon_id, config');
        if (configs) {
          for (const cfg of configs) {
            if (cfg.config && cfg.config.enabled === false) {
              disabled.add(cfg.addon_id);
            }
          }
        }
      }

      for (const addon of ADDONS_REGISTRY) {
        if (addon.settingsRoute) {
          // Widget addons: installed if not explicitly disabled
          if (!disabled.has(addon.id)) {
            installed.add(addon.id);
          }
        } else if (addon.collections.length > 0 && existingSlugs.has(addon.collections[0].slug)) {
          installed.add(addon.id);
        }
      }

      setInstalledIds(installed);
      setDisabledIds(disabled);
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
        // If collection already exists, update its schema so reinstalling
        // delivers new/renamed fields, options, or helpText without losing data.
        if (error && error.includes('already exists')) {
          const { error: updateErr } = await api.updateCollection(col.slug, {
            name: col.name, description: col.description, fields: col.fields,
          });
          if (updateErr) throw new Error(updateErr);
        } else if (error) {
          throw new Error(error);
        }
      }

      setInstalledIds(prev => new Set([...prev, addon.id]));
    } catch (err: any) {
      toast.error('Failed to install: ' + (err.message || 'Unknown error'));
    } finally {
      setInstalling(null);
    }
  };

  /**
   * Re-pushes the add-on's collection field definitions to the API for an
   * already-installed add-on. Needed whenever the add-on's registry definition
   * changes (new fields, renamed labels, changed types) — the collection
   * schema in the DB is otherwise frozen at install time.
   */
  const handleSyncSchema = async (addon: AddonDefinition) => {
    setInstalling(addon.id);
    let updated = 0;
    try {
      for (const col of addon.collections) {
        const { error } = await api.updateCollection(col.slug, {
          name: col.name, description: col.description, fields: col.fields,
        });
        if (error) throw new Error(error);
        updated++;
      }
      toast.success(`Schema updated — ${updated} collection${updated === 1 ? '' : 's'} in sync`);
    } catch (err: any) {
      toast.error('Sync failed: ' + (err.message || 'Unknown error'));
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

  const handleDisableWidget = async (addon: AddonDefinition) => {
    if (!confirm(`Disable "${addon.name}"? The widget will stop appearing on your sites.`)) return;
    setInstalling(addon.id);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Not connected');

      // Load existing config, set enabled=false
      const { data: existing } = await supabase.from('addon_configs').select('config').eq('addon_id', addon.id).single();
      const config = { ...(existing?.config || {}), enabled: false };
      await supabase.from('addon_configs').upsert({ addon_id: addon.id, config });

      setInstalledIds(prev => { const next = new Set(prev); next.delete(addon.id); return next; });
      setDisabledIds(prev => new Set([...prev, addon.id]));
    } catch (err: any) {
      toast.error('Failed to disable: ' + (err.message || 'Unknown error'));
    } finally {
      setInstalling(null);
    }
  };

  const handleEnableWidget = async (addon: AddonDefinition) => {
    setInstalling(addon.id);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Not connected');

      const { data: existing } = await supabase.from('addon_configs').select('config').eq('addon_id', addon.id).single();
      const config = { ...(existing?.config || {}), enabled: true };
      await supabase.from('addon_configs').upsert({ addon_id: addon.id, config });

      setInstalledIds(prev => new Set([...prev, addon.id]));
      setDisabledIds(prev => { const next = new Set(prev); next.delete(addon.id); return next; });
    } catch (err: any) {
      toast.error('Failed to enable: ' + (err.message || 'Unknown error'));
    } finally {
      setInstalling(null);
    }
  };

  const handleTestStripe = async () => {
    setTestingStripe(true);
    try {
      const { data, error } = await api.testStripe();
      if (error) {
        toast.error('Stripe test failed: ' + error);
        return;
      }
      if (data?.checkout_url) {
        const mode = data.diagnostics?.mode || 'unknown';
        toast.success(`Test session created (${mode} mode). Opening checkout…`);
        window.open(data.checkout_url, '_blank');
      } else {
        toast.error('No checkout URL returned');
      }
    } catch (err: any) {
      toast.error('Stripe test failed: ' + (err.message || 'Unknown error'));
    } finally {
      setTestingStripe(false);
    }
  };

  const displayAddons = tab === 'installed'
    ? ADDONS_REGISTRY.filter(a => installedIds.has(a.id) || disabledIds.has(a.id))
    : ADDONS_REGISTRY;

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case 'marketing': return 'Marketing';
      case 'content': return 'Content';
      case 'commerce': return 'Commerce';
      case 'tools': return 'Tools';
      case 'compliance': return 'Compliance';
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

                {addon.collections.length > 0 ? (
                  <CardCollections>
                    <div className="cc-label">Creates collections</div>
                    <div className="cc-list">
                      {addon.collections.map(col => (
                        <span key={col.slug} className="cc-item">{col.name}</span>
                      ))}
                    </div>
                  </CardCollections>
                ) : addon.settingsRoute ? (
                  <CardCollections>
                    <div className="cc-label">Embeddable widget</div>
                    <div className="cc-list">
                      <span className="cc-item">Dedicated settings page</span>
                    </div>
                  </CardCollections>
                ) : null}

                <CardFooter>
                  {isInstalled ? (
                    <>
                      <FooterRow>
                        <InstalledBadge><CheckCircle /> Installed</InstalledBadge>
                        <Btn $variant="primary" onClick={() => navigate(
                          addon.settingsRoute ? addon.settingsRoute :
                          addon.id === 'bookings' ? '/bookings' :
                          `/content/${addon.collections[0].slug}`
                        )}>
                          {addon.settingsRoute ? 'Settings' : 'Open'} <ArrowRight />
                        </Btn>
                      </FooterRow>
                      <SecondaryActions>
                        {addon.id === 'stripe-payments' && (
                          <Btn
                            $variant="ghost"
                            $size="sm"
                            onClick={() => handleTestStripe()}
                            disabled={testingStripe}
                            title="Create a test Stripe Checkout session (1.00 EUR, opens in new tab)"
                          >
                            {testingStripe ? (
                              <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Testing…</>
                            ) : (
                              <><ExternalLink /> Test checkout</>
                            )}
                          </Btn>
                        )}
                        {addon.collections.length > 0 && (
                          <Btn
                            $variant="ghost"
                            $size="sm"
                            onClick={() => handleSyncSchema(addon)}
                            disabled={isInstalling}
                            title="Push latest field definitions to the collection schema"
                          >
                            {isInstalling ? (
                              <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Syncing…</>
                            ) : (
                              <><RefreshCw /> Update schema</>
                            )}
                          </Btn>
                        )}
                        {addon.settingsRoute ? (
                          <Btn $variant="danger" $size="sm" onClick={() => handleDisableWidget(addon)} disabled={isInstalling}>
                            <PowerOff /> Disable
                          </Btn>
                        ) : (
                          <Btn $variant="danger" $size="sm" onClick={() => handleUninstall(addon)} disabled={isInstalling}>
                            <Trash2 /> Uninstall
                          </Btn>
                        )}
                      </SecondaryActions>
                    </>
                  ) : disabledIds.has(addon.id) ? (
                    <>
                      <FooterRow>
                        <span style={{ fontSize: 12, color: colors.gray[400], fontWeight: 500, padding: '3px 10px', background: colors.gray[100], borderRadius: 99 }}>
                          Disabled
                        </span>
                        <div style={{ display: 'flex', gap: spacing[2] }}>
                          <Btn $variant="ghost" onClick={() => navigate(addon.settingsRoute!)}>
                            Settings <ArrowRight />
                          </Btn>
                          <Btn $variant="primary" onClick={() => handleEnableWidget(addon)} disabled={isInstalling}>
                            {isInstalling ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enabling...</> : <><Power /> Enable</>}
                          </Btn>
                        </div>
                      </FooterRow>
                    </>
                  ) : (
                    <FooterRow>
                      <span style={{ fontSize: 13, color: colors.gray[400] }}>
                        {addon.collections.length > 0 ? `${addon.collections.reduce((sum, c) => sum + c.fields.length, 0)} fields` : 'Widget'}
                      </span>
                      <Btn $variant="primary" onClick={() => addon.settingsRoute ? handleEnableWidget(addon) : handleInstall(addon)} disabled={isInstalling}>
                        {isInstalling ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Installing...</> : <><Download /> Install</>}
                      </Btn>
                    </FooterRow>
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
