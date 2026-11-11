/**
 * Popups & announcement bars — add-on "Popups".
 *
 * Entries of the `popups` collection (created by installing the add-on),
 * served to the widgets loader through the bootstrap (configs.popups) and
 * rendered by static/popups-widget.js. Everything the visitor sees is plain
 * text: the widget never injects HTML coming from the CMS, URLs are checked
 * here, colours must be hex.
 */

import { supabase } from './supabase.js';
import { hasSoftDelete } from './soft-delete.js';
import { getSingletonContent } from './sitemap.js';

export const POPUPS_SLUG = 'popups';
export const MAX_ACTIVE_POPUPS = 20;

export type PopupKind = 'bar' | 'popup';
export type PopupAction = 'link' | 'whatsapp' | 'newsletter' | 'coupon' | 'close';
export type PopupTrigger = 'immediate' | 'delay' | 'scroll' | 'exit';
export type PopupFrequency = 'always' | 'session' | 'days';

export interface PopupItem {
  id: string;
  name: string;
  kind: PopupKind;
  position: 'top' | 'bottom';
  title: string;
  text: string;
  image: string;
  button_label: string;
  action: PopupAction;
  url: string;
  whatsapp: string;
  whatsapp_message: string;
  coupon_code: string;
  newsletter_source: string;
  consent_text: string;
  pages: string[];
  trigger: PopupTrigger;
  trigger_value: number;
  frequency: PopupFrequency;
  frequency_days: number;
  start_at: string | null;
  end_at: string | null;
  accent: string;
  theme: 'light' | 'dark';
  priority: number;
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v) : NaN);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
/** Date or date-time; a bare date as `end` means the end of that day. */
const isoDate = (v: unknown, end = false): string | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) && end ? `${s}T23:59:59` : s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const safeUrl = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return /^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(s) && !/[\s<>"'`]/.test(s) ? s.slice(0, 2000) : '';
};
const hexColor = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s) ? s : '';
};
const imageUrl = (v: unknown): string => {
  const u = typeof v === 'string' ? v : (v && typeof v === 'object' && typeof (v as any).url === 'string' ? (v as any).url : '');
  return /^https?:\/\/[^\s"'<>]+$/.test(u) ? u : '';
};

/** Page patterns: "/", "/tours/*", "*" (all). Comma or newline separated. Empty = every page. */
export function parsePages(v: unknown): string[] {
  return String(v ?? '').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 50);
}

export function matchesPage(patterns: string[], path: string): boolean {
  const p = ((path || '/').split('?')[0].split('#')[0]).replace(/\/+$/, '') || '/';
  if (!patterns.length) return true;
  return patterns.some(pat => {
    const t = pat.replace(/\/+$/, '') || '/';
    if (t === '*') return true;
    if (t.endsWith('/*')) {
      const base = t.slice(0, -2) || '/';
      return p === base || p.startsWith(base === '/' ? '/' : base + '/');
    }
    return p === t;
  });
}

/** Cleans one entry into what the widget may render. Never throws. */
export function normalizePopup(entry: { id: string; content?: Record<string, any> | null }): PopupItem {
  const c = entry.content || {};
  const kind = oneOf(c.kind, ['bar', 'popup'] as const, 'popup');
  return {
    id: entry.id,
    name: text(c.name, 80) || 'Popup',
    kind,
    position: oneOf(c.position, ['top', 'bottom'] as const, 'top'),
    title: text(c.title, 120),
    text: text(c.text, 600),
    image: kind === 'popup' ? imageUrl(c.image) : '',
    button_label: text(c.button_label, 40),
    action: oneOf(c.button_action, ['link', 'whatsapp', 'newsletter', 'coupon', 'close'] as const, 'close'),
    url: safeUrl(c.button_url),
    whatsapp: String(c.whatsapp_number ?? '').replace(/[^\d+]/g, '').slice(0, 20),
    whatsapp_message: text(c.whatsapp_message, 300),
    coupon_code: text(c.coupon_code, 40),
    newsletter_source: text(c.newsletter_source, 60) || 'popup',
    consent_text: text(c.consent_text, 200),
    pages: parsePages(c.pages),
    trigger: oneOf(c.trigger, ['immediate', 'delay', 'scroll', 'exit'] as const, 'immediate'),
    trigger_value: num(c.trigger_value, 5, 0, 600),
    frequency: oneOf(c.frequency, ['always', 'session', 'days'] as const, 'session'),
    frequency_days: num(c.frequency_days, 7, 1, 365),
    start_at: isoDate(c.start_at),
    end_at: isoDate(c.end_at, true),
    accent: hexColor(c.accent_color),
    theme: oneOf(c.theme, ['light', 'dark'] as const, 'light'),
    priority: num(c.priority, 10, 0, 1000),
  };
}

/** Enabled, inside its dates, with something to show, and with what its action needs. */
export function isActive(item: PopupItem, enabled: unknown, now = Date.now()): boolean {
  if (enabled === false || enabled === 'false') return false;
  if (item.start_at && Date.parse(item.start_at) > now) return false;
  if (item.end_at && Date.parse(item.end_at) < now) return false;
  if (!item.title && !item.text) return false;
  if (item.action === 'link' && !item.url) return false;
  if (item.action === 'whatsapp' && !item.whatsapp) return false;
  if (item.action === 'coupon' && !item.coupon_code) return false;
  return true;
}

export async function loadActivePopups(now = Date.now()): Promise<PopupItem[]> {
  const { data: col } = await supabase.from('collections').select('id').eq('slug', POPUPS_SLUG).maybeSingle();
  if (!col) return [];
  let q = supabase.from('entries').select('id, content').eq('collection_id', col.id).eq('status', 'published').limit(200);
  if (await hasSoftDelete()) q = q.is('deleted_at', null);
  const { data } = await q;
  const items: PopupItem[] = [];
  for (const row of (data || []) as any[]) {
    const item = normalizePopup(row);
    if (isActive(item, row.content?.enabled, now)) items.push(item);
  }
  items.sort((a, b) => a.priority - b.priority);
  return items.slice(0, MAX_ACTIVE_POPUPS);
}

export interface PopupsConfig {
  items: PopupItem[];
  /** Public Turnstile site key, only when the tenant demands a captcha on sign-ups (secret set). */
  turnstileSiteKey: string;
}

export async function getPopupsConfig(): Promise<PopupsConfig> {
  const items = await loadActivePopups();
  let turnstileSiteKey = '';
  if (items.some(i => i.action === 'newsletter')) {
    const site = await getSingletonContent('site-settings');
    if (String(site.turnstile_secret_key || '').trim()) turnstileSiteKey = String(site.turnstile_site_key || '').trim().slice(0, 100);
  }
  return { items, turnstileSiteKey };
}
