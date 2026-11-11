/**
 * Widgets bootstrap — everything the universal loader and the widgets need
 * to start, in ONE request. It used to take eight per page view (enabled
 * list, cluster config, SEO/analytics, cookie, accessibility, WhatsApp, i18n
 * widget, i18n languages), each with its own preflight.
 *
 * Also owns the static-files version: the loader appends `?v=<version>` to
 * the widget scripts it injects, so those can be cached for a year while a
 * deploy still reaches every site within the loader's own 5-minute TTL.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { loadSeoConfig } from '../routes/seo.js';
import { publicI18nLanguages, publicI18nWidget } from '../routes/i18n.js';
import { siteContentEnabled } from './site-content.js';
import { getPopupsConfig, loadActivePopups, type PopupsConfig } from './popups.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// dev: src/lib → src/static · prod: dist/lib → /app/apps/api/static (copied by the Dockerfile)
const candidates = [path.join(here, '../static'), path.join(here, '../../static')];
export const WIDGET_STATIC_DIR = candidates.find(d => existsSync(path.join(d, 'widgets-loader.js'))) || candidates[0];

export const WIDGET_FILES = [
  'widgets-loader.js', 'cookie-notice-widget.js', 'accessibility-widget.js', 'whatsapp-widget.js', 'i18n-widget.js',
  'edit-overlay.js', 'popups-widget.js',
] as const;

/** Short hash of the widget scripts shipped with this build. */
export const WIDGETS_VERSION: string = (() => {
  try {
    const h = createHash('sha1');
    for (const f of WIDGET_FILES) h.update(readFileSync(path.join(WIDGET_STATIC_DIR, f)));
    return h.digest('hex').slice(0, 10);
  } catch {
    return Date.now().toString(36);
  }
})();

// Mirrors the admin's "installed/enabled" semantics (apps/admin/src/pages/Addons.tsx):
//   - Settings-based widgets (cookie-notice, accessibility) are installed by
//     default and only excluded when addon_configs has an explicit `enabled:false`.
//   - Collection-based widgets (whatsapp-widget, i18n) are installed only if
//     their defining collection exists; enabled state then comes from a
//     collection entry (whatsapp-widget) or addon_configs (i18n).
const SETTINGS_WIDGET_ADDON_IDS = ['cookie-notice', 'accessibility'];

export const DEFAULT_CLUSTER_CONFIG = {
  accentColor: null as string | null,
  includedWidgets: ['cookie-notice', 'accessibility', 'whatsapp-widget', 'i18n'],
  // 'corner' = round trigger in the corner; 'edge' = discreet side tab
  layout: 'corner' as 'corner' | 'edge',
  edgeSide: 'right' as 'left' | 'right',
};

async function addonConfigs(ids: string[]): Promise<Map<string, Record<string, any>>> {
  const { data } = await supabase.from('addon_configs').select('addon_id, config').in('addon_id', ids);
  const map = new Map<string, Record<string, any>>();
  for (const row of data || []) map.set(row.addon_id, (row.config as Record<string, any>) || {});
  return map;
}

async function collectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).maybeSingle();
  return data?.id || null;
}

/** addon_ids of widget add-ons that are installed AND enabled. */
export async function getEnabledWidgets(): Promise<string[]> {
  const configs = await addonConfigs([...SETTINGS_WIDGET_ADDON_IDS, 'i18n']);
  const disabled = (id: string) => configs.get(id)?.enabled === false;
  const enabled = SETTINGS_WIDGET_ADDON_IDS.filter(id => !disabled(id));

  const wa = await getWhatsAppConfig();
  if (wa.enabled) enabled.push('whatsapp-widget');

  if ((await collectionId('i18n-config')) && !disabled('i18n')) enabled.push('i18n');

  // Popups: the widget is only worth loading when something is active today
  if ((await loadActivePopups()).length > 0) enabled.push('popups');
  return enabled;
}

export async function getClusterConfig(): Promise<typeof DEFAULT_CLUSTER_CONFIG> {
  const configs = await addonConfigs(['widget-cluster']);
  return { ...DEFAULT_CLUSTER_CONFIG, ...(configs.get('widget-cluster') || {}) };
}

/** cookie-notice / accessibility: no row = installed but never configured → enabled. */
export async function getAddonConfig(addonId: string): Promise<Record<string, any>> {
  const configs = await addonConfigs([addonId]);
  return configs.get(addonId) || { enabled: true };
}

/** The published entry with slug 'config' in the 'whatsapp-widget' collection. */
export async function getWhatsAppConfig(): Promise<Record<string, any>> {
  const colId = await collectionId('whatsapp-widget');
  if (!colId) return { enabled: false };
  const { data: entry } = await supabase
    .from('entries')
    .select('content')
    .eq('collection_id', colId)
    .eq('slug', 'config')
    .eq('status', 'published')
    .maybeSingle();
  return (entry?.content as Record<string, any>) || { enabled: false };
}

export interface WidgetsBootstrap {
  version: string;
  enabled: string[];
  cluster: typeof DEFAULT_CLUSTER_CONFIG;
  /** Same shape as /api/v1/seo → data.analytics */
  analytics: Record<string, unknown>;
  configs: {
    'cookie-notice': Record<string, any>;
    accessibility: Record<string, any>;
    'whatsapp-widget': Record<string, any>;
    i18n: { widget: Record<string, any>; languages: Record<string, any> | null };
    /** Active popups / announcement bars (add-on "Popups"); present only when at least one is active. */
    popups?: PopupsConfig;
  };
  /** Texts captured with "Editar no site": when enabled the loader asks /widgets/site-content for the page. */
  siteContent: { enabled: boolean };
}

async function guarded<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    logger.warn('Widgets bootstrap: section failed', { section: label, error: err?.message });
    return fallback;
  }
}

export async function buildBootstrap(baseUrl: string): Promise<WidgetsBootstrap> {
  const [enabled, cluster, seo, cookie, a11y, whatsapp, i18nWidget, i18nLanguages, siteContent, popups] = await Promise.all([
    guarded('enabled', [] as string[], getEnabledWidgets),
    guarded('cluster', DEFAULT_CLUSTER_CONFIG, getClusterConfig),
    guarded('seo', { analytics: {} } as any, loadSeoConfig),
    guarded('cookie-notice', { enabled: true }, () => getAddonConfig('cookie-notice')),
    guarded('accessibility', { enabled: true }, () => getAddonConfig('accessibility')),
    guarded('whatsapp-widget', { enabled: false }, getWhatsAppConfig),
    guarded('i18n-widget', { enabled: false }, () => publicI18nWidget(baseUrl)),
    guarded('i18n-languages', null as Record<string, any> | null, publicI18nLanguages),
    guarded('site-content', false, siteContentEnabled),
    guarded('popups', { items: [], turnstileSiteKey: '' } as PopupsConfig, getPopupsConfig),
  ]);
  return {
    version: WIDGETS_VERSION,
    enabled,
    cluster,
    analytics: (seo && seo.analytics) || {},
    configs: {
      'cookie-notice': cookie,
      accessibility: a11y,
      'whatsapp-widget': whatsapp,
      i18n: { widget: i18nWidget, languages: i18nLanguages },
      ...(popups.items.length ? { popups } : {}),
    },
    siteContent: { enabled: siteContent },
  };
}
