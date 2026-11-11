/**
 * Inline editing ("Editar no site") — pure helpers.
 *
 * An admin opens the live site from the Kiban admin with a short-lived signed
 * token; the widgets loader then injects edit-overlay.js, which lets them click
 * a text or an image and change it in place. These helpers decide what can be
 * edited, map a page URL to candidate entries, validate the requested changes
 * and compute the columns to update. No I/O here, so they are unit-testable.
 *
 * Phase 1 (beta): plain text, numbers and images. Rich text waits for phase 2.
 */

import { PRIVATE_COLLECTIONS, SECRET_FIELD_PATTERN } from '../routes/entries.js';
import type { FieldDef } from './validate-content.js';

export type InlineEditMode = 'off' | 'beta' | 'on';
export type SaveMode = 'draft' | 'publish';

/** Editing sessions last 4h: an afternoon of edits, then the admin must reopen the site from Kiban. */
export const EDIT_TOKEN_TTL_SECONDS = 4 * 60 * 60;
export const MAX_TEXT_LENGTH = 5000;
export const MAX_CHANGES_PER_REQUEST = 50;
export const MAX_PENDING_PER_ENTRY = 100;

export function parseMode(value: unknown): InlineEditMode {
  return value === 'beta' || value === 'on' ? value : 'off';
}

/** Beta: admins only, everything saved as pending. On: editors too, changes go live. */
export function roleAllowed(mode: InlineEditMode, role: string | null | undefined): boolean {
  if (mode === 'beta') return ['super_admin', 'admin'].includes(role || '');
  if (mode === 'on') return ['super_admin', 'admin', 'editor'].includes(role || '');
  return false;
}

export function saveModeFor(mode: InlineEditMode): SaveMode {
  return mode === 'on' ? 'publish' : 'draft';
}

/** Content collections only: never config, customer data or add-on internals. */
export function isEditableCollection(slug: string): boolean {
  if (!slug || PRIVATE_COLLECTIONS.has(slug)) return false;
  if (/(-settings|-config|-translations|-campaigns|-redemptions|-submissions)$/.test(slug)) return false;
  return !['site-settings', 'seo-settings', 'whatsapp-widget', 'redirects', 'widget-cluster'].includes(slug);
}

const HOME_SLUGS = ['home', 'index', 'inicio', 'homepage', 'pagina-inicial', 'start'];

export interface PathInfo {
  /** Language prefix found in the path (only when it is one of the site's languages). */
  lang: string | null;
  /** Entry slugs worth looking up for this URL. */
  slugs: string[];
  /** Segment before the slug, e.g. "tours" in /tours/lisbon — used to prefer that collection. */
  collectionHint: string | null;
}

/** Maps a page path to the slugs that may hold its content. `languages` are lowercase codes. */
export function parsePath(pathname: string, languages: string[] = []): PathInfo {
  let path = String(pathname || '/');
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  path = path.split(/[?#]/)[0].toLowerCase();
  const segments = path.split('/').filter(Boolean);

  let lang: string | null = null;
  if (segments.length && /^[a-z]{2}(-[a-z]{2})?$/.test(segments[0])) {
    const known = languages.length ? languages.includes(segments[0]) : segments[0].length === 2;
    if (known) lang = segments.shift() || null;
  }

  if (segments.length === 0) return { lang, slugs: HOME_SLUGS, collectionHint: null };

  const last = segments[segments.length - 1].replace(/\.(html?|php)$/, '');
  if (!/^[a-z0-9-]+$/.test(last)) return { lang, slugs: [], collectionHint: null };
  const hint = segments.length >= 2 ? segments[segments.length - 2] : null;
  return { lang, slugs: [last], collectionHint: hint && /^[a-z0-9-]+$/.test(hint) ? hint : null };
}

export interface EditableField {
  /** 'title' | 'excerpt' | 'featured_image' | 'content.<field id>' */
  key: string;
  /** text | textarea | number | image | richtext (listed so the overlay can explain why it is locked) */
  type: 'text' | 'textarea' | 'number' | 'image' | 'richtext';
  label: string;
}

// Stricter than the public redaction: anything that smells like a credential or
// an identifier has no business being edited by clicking on a web page.
const HIDDEN_KEY_RE = /(token|_key$|^key$|hash|signature|_id$|^id$|^slug$)/i;
function hiddenKey(key: string): boolean {
  return SECRET_FIELD_PATTERN.test(key) || HIDDEN_KEY_RE.test(key);
}

const TEXT_TYPES = new Set(['text', 'email', 'url', 'string', 'select']);
const IMAGE_TYPES = new Set(['image', 'media']);
const IMAGE_URL_RE = /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i;

/**
 * Which parts of an entry the overlay may edit. With a field schema we follow
 * the field types; schema-less collections expose their string values.
 */
export function editableFields(fields: FieldDef[] | null | undefined, content: Record<string, any> | null | undefined): EditableField[] {
  const out: EditableField[] = [
    { key: 'title', type: 'text', label: 'Título' },
    { key: 'excerpt', type: 'textarea', label: 'Resumo' },
    { key: 'featured_image', type: 'image', label: 'Imagem destacada' },
  ];
  const body = content && typeof content === 'object' ? content : {};

  if (fields && fields.length > 0) {
    for (const f of fields) {
      if (!f || !f.id || hiddenKey(f.id)) continue;
      const label = f.name || f.id;
      if (TEXT_TYPES.has(f.type)) out.push({ key: `content.${f.id}`, type: 'text', label });
      else if (f.type === 'textarea') out.push({ key: `content.${f.id}`, type: 'textarea', label });
      else if (f.type === 'number') out.push({ key: `content.${f.id}`, type: 'number', label });
      else if (IMAGE_TYPES.has(f.type)) out.push({ key: `content.${f.id}`, type: 'image', label });
      else if (f.type === 'richtext') out.push({ key: `content.${f.id}`, type: 'richtext', label });
    }
    return out;
  }

  for (const [key, value] of Object.entries(body)) {
    if (hiddenKey(key)) continue;
    if (typeof value === 'number') out.push({ key: `content.${key}`, type: 'number', label: key });
    else if (typeof value === 'string') {
      if (IMAGE_URL_RE.test(value) && /^https?:\/\//.test(value)) out.push({ key: `content.${key}`, type: 'image', label: key });
      else if (/<[a-z][^>]*>/i.test(value)) out.push({ key: `content.${key}`, type: 'richtext', label: key });
      else out.push({ key: `content.${key}`, type: value.includes('\n') ? 'textarea' : 'text', label: key });
    } else if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as any).url === 'string') {
      out.push({ key: `content.${key}`, type: 'image', label: key });
    }
  }
  return out;
}

export interface InlineChange { field: string; value: string | number; }

export interface PendingChange extends InlineChange {
  lang: string | null;
  previous: unknown;
  by: string;
  at: string;
}

/** Plain text only: tags stripped, whitespace tidied, length capped. */
export function sanitizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

export function isSafeImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2000 && /^https?:\/\/[^\s"'<>]+$/.test(value);
}

/** Validates the overlay's changes against the collection schema. Throws with a user-facing message. */
export function normalizeChanges(
  changes: unknown,
  fields: FieldDef[] | null | undefined,
  content: Record<string, any> | null | undefined,
  lang: string | null,
): InlineChange[] {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('No changes provided');
  if (changes.length > MAX_CHANGES_PER_REQUEST) throw new Error(`Too many changes in one request (max ${MAX_CHANGES_PER_REQUEST})`);

  const editable = new Map(editableFields(fields, content).map(f => [f.key, f]));
  const byField = new Map<string, InlineChange>();

  for (const raw of changes) {
    if (!raw || typeof raw !== 'object' || typeof (raw as any).field !== 'string') throw new Error('Each change needs a field');
    const field = (raw as any).field as string;
    const def = editable.get(field);
    if (!def) throw new Error(`Field "${field}" cannot be edited on the site`);
    if (def.type === 'richtext') throw new Error(`"${def.label}" is rich text — edit it in the admin for now`);
    if (lang) {
      if (!(field === 'title' || field.startsWith('content.'))) throw new Error(`"${def.label}" is shared by all languages — switch to the default language to change it`);
      if (def.type === 'image') throw new Error('Images are shared by all languages — switch to the default language to change them');
    }

    const value = (raw as any).value;
    if (def.type === 'image') {
      if (!isSafeImageUrl(value)) throw new Error('Image must be an http(s) URL');
      byField.set(field, { field, value });
    } else if (def.type === 'number') {
      const n = Number(sanitizeText(value).replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(n)) throw new Error(`"${def.label}" must be a number`);
      byField.set(field, { field, value: n });
    } else {
      const text = sanitizeText(value);
      if (field === 'title' && !text) throw new Error('The title cannot be empty');
      byField.set(field, { field, value: text });
    }
  }
  return [...byField.values()];
}

interface EntryLike {
  title?: string | null;
  excerpt?: string | null;
  featured_image?: string | null;
  content?: Record<string, any> | null;
  meta?: Record<string, any> | null;
}

/** Current value of a field as the site shows it (translation-aware). */
export function currentValue(entry: EntryLike, field: string, lang: string | null): unknown {
  const tr = lang ? entry.meta?.translations?.[lang] : null;
  if (field === 'title') return tr?._title ?? entry.title;
  if (field === 'excerpt') return entry.excerpt;
  if (field === 'featured_image') return entry.featured_image;
  if (field.startsWith('content.')) {
    const key = field.slice('content.'.length);
    if (tr && tr[key] !== undefined) return tr[key];
    return entry.content?.[key];
  }
  return undefined;
}

/**
 * Columns to update for a set of changes. In a non-default language the text
 * goes to meta.translations[lang] (what GET ?lang= overlays); otherwise to the
 * entry itself. Image objects ({url, focal, alt}) keep their extra keys.
 */
export function applyChanges(entry: EntryLike, changes: InlineChange[], lang: string | null): Record<string, any> {
  const update: Record<string, any> = {};
  const content: Record<string, any> = { ...(entry.content || {}) };
  const meta: Record<string, any> = { ...(entry.meta || {}) };
  let contentTouched = false;
  let metaTouched = false;

  if (lang) {
    const translations = { ...(meta.translations || {}) };
    const current = { ...(translations[lang] || {}) };
    for (const c of changes) {
      if (c.field === 'title') current._title = c.value;
      else if (c.field.startsWith('content.')) current[c.field.slice('content.'.length)] = c.value;
    }
    translations[lang] = current;
    meta.translations = translations;
    metaTouched = true;
  } else {
    for (const c of changes) {
      if (c.field === 'title') update.title = c.value;
      else if (c.field === 'excerpt') update.excerpt = c.value === '' ? null : c.value;
      else if (c.field === 'featured_image') update.featured_image = c.value;
      else if (c.field.startsWith('content.')) {
        const key = c.field.slice('content.'.length);
        const existing = content[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing) && typeof c.value === 'string' && 'url' in existing) {
          content[key] = { ...existing, url: c.value };
        } else {
          content[key] = c.value;
        }
        contentTouched = true;
      }
    }
  }

  if (contentTouched) update.content = content;
  if (metaTouched) update.meta = meta;
  return update;
}

/** Queue changes for approval: replaces an older pending change of the same field+language. */
export function mergePending(
  existing: unknown,
  changes: InlineChange[],
  entry: EntryLike,
  lang: string | null,
  by: string,
  at = new Date().toISOString(),
): PendingChange[] {
  const list = Array.isArray(existing) ? (existing as PendingChange[]) : [];
  const kept = list.filter(p => !changes.some(c => c.field === p.field && (p.lang || null) === lang));
  const added = changes.map<PendingChange>(c => ({
    field: c.field, value: c.value, lang, previous: currentValue(entry, c.field, lang) ?? null, by, at,
  }));
  return [...kept, ...added];
}

// ── Collection fallback ──────────────────────────────────────────────
// Pages show lists (team, services, testimonials…) whose entries have nothing
// to do with the URL. Small editable collections are sent whole and matched by
// text on the page; big ones (a blog) are left out.
export const MAX_FALLBACK_ENTRIES = 300;
export const MAX_FALLBACK_PER_COLLECTION = 100;

/** Ids of the collections to send whole: smallest first, until the budget is spent. */
export function pickFallbackCollections(
  counts: Array<{ id: string; count: number }>,
  perCollection = MAX_FALLBACK_PER_COLLECTION,
  total = MAX_FALLBACK_ENTRIES,
): string[] {
  const chosen: string[] = [];
  let budget = total;
  for (const c of [...counts].sort((a, b) => a.count - b.count)) {
    if (c.count <= 0 || c.count > perCollection) continue;
    if (c.count > budget) break;
    chosen.push(c.id);
    budget -= c.count;
  }
  return chosen;
}
