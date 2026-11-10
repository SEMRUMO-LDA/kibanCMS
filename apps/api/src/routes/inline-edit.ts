/**
 * Inline editing ("Editar no site") — API.
 *
 *   POST /api/v1/inline-edit/session            JWT       → signed editing token + URL to open the site with
 *   GET  /api/v1/inline-edit/resolve?path=&lang= token     → entries behind this page, editable fields, session info
 *   PATCH /api/v1/inline-edit/entries/:id        token     → save changes (pending in beta, live when mode = on)
 *   POST /api/v1/inline-edit/media               token     → upload an image chosen on the site
 *   POST /api/v1/inline-edit/pending/:id/apply   JWT       → admin approves pending changes
 *   POST /api/v1/inline-edit/pending/:id/discard JWT       → admin rejects pending changes
 *
 * The token (header X-Kiban-Edit) is an HMAC-signed payload bound to the user
 * and the tenant; every request re-checks the site setting (kill switch) and
 * the user's current role. Visitors never see any of this: the overlay script
 * is only injected when the token is present.
 */

import { Router, type Response, type NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';
import { tenantStore } from '../middleware/tenant.js';
import type { AuthRequest } from '../middleware/auth.js';
import { signLink, verifyLink } from '../lib/signed-links.js';
import { hasSoftDelete } from '../lib/soft-delete.js';
import { invalidateCachePattern } from '../lib/redis.js';
import { validateContent } from '../lib/validate-content.js';
import { getSingletonContent } from '../lib/sitemap.js';
import { autoTranslateEntryToAllLanguages, getI18nConfig } from './i18n.js';
import { redactForPublic } from './entries.js';
import { mediaUpload, processUpload } from './media.js';
import {
  EDIT_TOKEN_TTL_SECONDS, MAX_PENDING_PER_ENTRY,
  parseMode, roleAllowed, saveModeFor, isEditableCollection, parsePath, editableFields,
  normalizeChanges, applyChanges, mergePending,
  type InlineEditMode, type SaveMode, type PendingChange, type InlineChange,
} from '../lib/inline-edit.js';

interface EditTokenPayload extends Record<string, unknown> {
  t: 'edit';
  uid: string;
  email: string;
  tenant: string;
}

export interface EditRequest extends AuthRequest {
  inlineEdit?: { mode: InlineEditMode; role: string; saveMode: SaveMode };
}

const ENTRY_COLS = 'id, collection_id, title, slug, excerpt, content, meta, featured_image, status, version';
const UUID_RE = /^[0-9a-f-]{36}$/i;

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: { message, status, timestamp: new Date().toISOString() } });
}

function currentTenantId(): string {
  return tenantStore.getStore()?.tenant?.id || 'default';
}

export async function getInlineEditingMode(): Promise<InlineEditMode> {
  const site = await getSingletonContent('site-settings');
  return parseMode(site.inline_editing);
}

async function profileOf(id: string): Promise<{ id: string; role: string | null; email: string | null } | null> {
  const { data } = await supabase.from('profiles').select('id, role, email').eq('id', id).maybeSingle();
  return (data as any) || null;
}

async function loadEntry(id: string) {
  let q = supabase.from('entries').select(ENTRY_COLS).eq('id', id);
  if (await hasSoftDelete()) q = q.is('deleted_at', null);
  const { data } = await q.maybeSingle();
  return data as any | null;
}

async function loadCollectionById(id: string) {
  const { data } = await supabase.from('collections').select('id, name, slug, fields').eq('id', id).maybeSingle();
  return data as { id: string; name: string; slug: string; fields: any[] | null } | null;
}

// ============================================
// POST /session — the admin asks to edit the site
// ============================================
export async function createSessionHandler(req: AuthRequest, res: Response) {
  if (!req.profileId) return fail(res, 401, 'Unauthorized');
  const mode = await getInlineEditingMode();
  if (mode === 'off') return fail(res, 403, 'Inline editing is turned off for this site (Settings → General → Edição no site)');

  const profile = await profileOf(req.profileId);
  if (!roleAllowed(mode, profile?.role)) {
    return fail(res, 403, mode === 'beta'
      ? 'During the beta only administrators can edit on the site'
      : 'Forbidden: insufficient permissions');
  }

  const site = await getSingletonContent('site-settings');
  const siteUrl = String(site.site_url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(siteUrl)) return fail(res, 400, 'Set the site URL in Settings → General first');

  const payload: EditTokenPayload = { t: 'edit', uid: req.profileId, email: req.user?.email || profile?.email || '', tenant: currentTenantId() };
  const token = signLink(payload, EDIT_TOKEN_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + EDIT_TOKEN_TTL_SECONDS * 1000).toISOString();
  const path = typeof req.body?.path === 'string' && req.body.path.startsWith('/') ? req.body.path.slice(0, 500) : '/';

  audit(req, 'inline_edit_session', 'site', undefined, { mode });
  res.json({
    data: {
      token, expires_at: expiresAt, mode, save_mode: saveModeFor(mode), site_url: siteUrl,
      edit_url: `${siteUrl}${path}#kiban-edit=${encodeURIComponent(token)}`,
    },
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Token middleware (X-Kiban-Edit)
// ============================================
export async function validateEditToken(req: EditRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers['x-kiban-edit'];
    const token = Array.isArray(raw) ? raw[0] : raw;
    const payload = verifyLink<EditTokenPayload>(token);
    if (!payload || payload.t !== 'edit' || typeof payload.uid !== 'string') { fail(res, 401, 'Your editing session has expired — open the site again from Kiban'); return; }
    if (payload.tenant !== currentTenantId()) { fail(res, 401, 'This editing session belongs to another site'); return; }

    const mode = await getInlineEditingMode();
    if (mode === 'off') { fail(res, 403, 'Inline editing has been turned off for this site'); return; }

    const profile = await profileOf(payload.uid);
    if (!profile) { fail(res, 401, 'Account not found'); return; }
    if (!roleAllowed(mode, profile.role)) { fail(res, 403, 'Your role can no longer edit on the site'); return; }

    req.profileId = profile.id;
    req.user = { id: profile.id, email: profile.email || payload.email };
    req.authType = 'jwt';
    req.inlineEdit = { mode, role: profile.role || '', saveMode: saveModeFor(mode) };
    next();
  } catch (err: any) {
    logger.error('Inline edit token validation failed', { error: err?.message });
    fail(res, 500, 'Internal server error');
  }
}

const router: Router = Router();

function serializeEntry(entry: any, col: { id: string; name: string; slug: string; fields: any[] | null }, lang: string | null) {
  const safe = redactForPublic(entry);
  const pending: PendingChange[] = Array.isArray(entry.meta?.inline_pending) ? entry.meta.inline_pending : [];
  return {
    id: entry.id,
    collection: { slug: col.slug, name: col.name },
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.excerpt,
    featured_image: entry.featured_image,
    content: safe.content || {},
    status: entry.status,
    version: entry.version,
    fields: editableFields(col.fields || [], entry.content || {}),
    translation: lang ? (entry.meta?.translations?.[lang] || null) : null,
    pending: pending.map(p => ({ field: p.field, value: p.value, lang: p.lang || null, by: p.by, at: p.at })),
  };
}

// ============================================
// GET /resolve?path=/sobre&lang=en&refs=tours/lisbon,pages/home
// ============================================
router.get('/resolve', async (req: EditRequest, res: Response) => {
  try {
    const path = String(req.query.path || '/').slice(0, 500);
    const htmlLang = String(req.query.lang || '').toLowerCase().slice(0, 10) || null;
    const refs = String(req.query.refs || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);

    const i18n = await getI18nConfig().catch(() => null);
    const sourceLang = i18n ? i18n.defaultLanguage.toLowerCase() : null;
    const languages = i18n ? [sourceLang as string, ...i18n.enabledLanguages.map(l => String(l.code).toLowerCase())] : [];
    const info = parsePath(path, languages);
    let lang: string | null = info.lang || htmlLang;
    if (!i18n || !lang || lang === sourceLang || !languages.includes(lang)) lang = null;

    const { data: cols } = await supabase.from('collections').select('id, name, slug, fields');
    const editableCols = ((cols || []) as any[]).filter(c => isEditableCollection(c.slug));
    const byId = new Map(editableCols.map(c => [c.id, c]));
    const bySlug = new Map(editableCols.map(c => [c.slug, c]));
    const softDelete = await hasSoftDelete();

    let entries: any[] = [];
    if (info.slugs.length && editableCols.length) {
      let q = supabase.from('entries').select(ENTRY_COLS)
        .in('collection_id', editableCols.map(c => c.id))
        .in('slug', info.slugs)
        .order('status', { ascending: false }) // 'published' sorts after 'draft'
        .limit(20);
      if (softDelete) q = q.is('deleted_at', null);
      const { data } = await q;
      entries = (data || []) as any[];
      if (info.collectionHint && entries.some(e => byId.get(e.collection_id)?.slug === info.collectionHint)) {
        entries = entries.filter(e => byId.get(e.collection_id)?.slug === info.collectionHint);
      }
    }

    for (const ref of refs) {
      const [colSlug, entrySlug] = ref.split('/');
      const col = bySlug.get(colSlug);
      if (!col || !entrySlug || !/^[a-z0-9-]+$/.test(entrySlug)) continue;
      if (entries.some(e => e.collection_id === col.id && e.slug === entrySlug)) continue;
      let q = supabase.from('entries').select(ENTRY_COLS).eq('collection_id', col.id).eq('slug', entrySlug).order('status', { ascending: false }).limit(1);
      if (softDelete) q = q.is('deleted_at', null);
      const { data } = await q;
      if (data && data[0]) entries.push(data[0]);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      data: {
        user: { email: req.user?.email || null, role: req.inlineEdit?.role || null },
        mode: req.inlineEdit?.mode,
        save_mode: req.inlineEdit?.saveMode,
        lang,
        source_lang: sourceLang,
        languages,
        entries: entries.map(e => serializeEntry(e, byId.get(e.collection_id)!, lang)),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Inline edit resolve failed', { error: err?.message });
    fail(res, 500, 'Internal server error');
  }
});

/** Resolves the language of a save request: null = default language (edit the entry itself). */
async function resolveLang(raw: unknown): Promise<{ lang: string | null; error?: string }> {
  const lang = typeof raw === 'string' && raw ? raw.toLowerCase().slice(0, 10) : null;
  if (!lang) return { lang: null };
  const i18n = await getI18nConfig().catch(() => null);
  if (!i18n || lang === i18n.defaultLanguage.toLowerCase()) return { lang: null };
  if (!i18n.enabledLanguages.some(l => String(l.code).toLowerCase() === lang)) return { lang: null, error: `Language "${lang}" is not enabled for this site` };
  return { lang };
}

// ============================================
// PATCH /entries/:id — save what was edited on the site
// ============================================
router.patch('/entries/:id', async (req: EditRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return fail(res, 400, 'Invalid id');
    const entry = await loadEntry(id);
    if (!entry) return fail(res, 404, 'Entry not found');
    const col = await loadCollectionById(entry.collection_id);
    if (!col || !isEditableCollection(col.slug)) return fail(res, 404, 'Entry not found');

    const { lang, error: langError } = await resolveLang(req.body?.lang);
    if (langError) return fail(res, 400, langError);

    let changes: InlineChange[];
    try {
      changes = normalizeChanges(req.body?.changes, col.fields || [], entry.content || {}, lang);
    } catch (e: any) {
      return fail(res, 400, e.message);
    }

    const clientVersion = req.body?.version;
    if (clientVersion !== undefined && Number(clientVersion) !== Number(entry.version)) {
      return fail(res, 409, 'This page was changed in the admin meanwhile — reload and try again');
    }

    const saveMode = req.inlineEdit?.saveMode || 'draft';
    const fields = changes.map(c => c.field);

    if (saveMode === 'draft') {
      const pending = mergePending(entry.meta?.inline_pending, changes, entry, lang, req.user?.email || 'unknown');
      if (pending.length > MAX_PENDING_PER_ENTRY) return fail(res, 400, 'Too many pending changes on this page — approve or discard them in the admin first');
      const { data: saved, error } = await supabase
        .from('entries')
        .update({ meta: { ...(entry.meta || {}), inline_pending: pending } })
        .eq('id', id)
        .eq('version', entry.version)
        .select('id, version')
        .single();
      if (error) {
        if (error.code === 'PGRST116') return fail(res, 409, 'This page was changed in the admin meanwhile — reload and try again');
        throw error;
      }
      audit(req, 'inline_edit_pending', 'entry', id, { collection: col.slug, fields, lang });
      return res.json({ data: { saved: 'pending', entry_id: id, version: saved.version, pending: pending.length }, timestamp: new Date().toISOString() });
    }

    const update = applyChanges(entry, changes, lang);
    if (update.content && col.fields && col.fields.length > 0) {
      const errors = validateContent(update.content, col.fields);
      if (errors.length) return fail(res, 400, `Content validation failed — ${errors.join(' · ')}`);
    }
    const { data: saved, error } = await supabase
      .from('entries')
      .update(update)
      .eq('id', id)
      .eq('version', entry.version)
      .select('id, version, status')
      .single();
    if (error) {
      if (error.code === 'PGRST116') return fail(res, 409, 'This page was changed in the admin meanwhile — reload and try again');
      throw error;
    }

    audit(req, 'inline_edit', 'entry', id, { collection: col.slug, fields, lang });
    invalidateCachePattern(`entries:${col.slug}:*`).catch(() => {});
    if (saved.status === 'published' && !lang) autoTranslateEntryToAllLanguages(id, col.slug).catch(() => { /* logged inside */ });

    res.json({ data: { saved: 'live', entry_id: id, version: saved.version }, timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error('Inline edit save failed', { error: err?.message });
    fail(res, 500, 'Internal server error');
  }
});

// ============================================
// POST /media — image chosen on the site (multipart, field "file")
// ============================================
router.post('/media', (req: EditRequest, res: Response) => {
  // Multer loses the AsyncLocalStorage tenant context: capture and re-enter it (same as routes/media.ts).
  const store = tenantStore.getStore();
  mediaUpload.single('file')(req, res, (err: any) => {
    if (err) {
      const status = (err as any).code === 'LIMIT_FILE_SIZE' ? 413 : /Unsupported file type/.test(err.message || '') ? 400 : 500;
      return fail(res, status, err.message || 'Upload failed');
    }
    const run = () => handleInlineUpload(req, res).catch((e: any) => {
      logger.error('Inline edit upload failed', { error: e?.message });
      fail(res, 500, e?.message || 'Upload failed');
    });
    if (store) tenantStore.run(store, run); else run();
  });
});

async function handleInlineUpload(req: EditRequest, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return fail(res, 400, 'No file provided. Use field name "file".');
  if (!/^image\//.test(file.mimetype)) return fail(res, 400, 'Only images can be replaced on the site');
  if (!req.profileId) return fail(res, 401, 'Unauthorized');
  const result = await processUpload(file.buffer, file.originalname, file.mimetype, req.profileId, {
    alt_text: typeof req.body?.alt_text === 'string' ? req.body.alt_text.slice(0, 300) : undefined,
    folder_path: '/site-edits',
    is_public: true,
  });
  audit(req, 'upload', 'media', result.id, { filename: result.filename, inline_edit: true });
  res.status(201).json({ data: { id: result.id, url: result.url }, timestamp: new Date().toISOString() });
}

// ============================================
// Approval (admin, JWT): apply / discard pending changes
// ============================================
function selectPending(list: PendingChange[], indexes: unknown): { selected: PendingChange[]; remaining: PendingChange[] } {
  if (!Array.isArray(indexes)) return { selected: list, remaining: [] };
  const set = new Set(indexes.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < list.length));
  return {
    selected: list.filter((_, i) => set.has(i)),
    remaining: list.filter((_, i) => !set.has(i)),
  };
}

export async function applyPendingHandler(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return fail(res, 400, 'Invalid id');
  const entry = await loadEntry(id);
  if (!entry) return fail(res, 404, 'Entry not found');
  const col = await loadCollectionById(entry.collection_id);
  if (!col) return fail(res, 404, 'Entry not found');

  const list: PendingChange[] = Array.isArray(entry.meta?.inline_pending) ? entry.meta.inline_pending : [];
  if (!list.length) return fail(res, 400, 'Nothing pending on this entry');
  const { selected, remaining } = selectPending(list, req.body?.indexes);
  if (!selected.length) return fail(res, 400, 'No pending changes selected');

  // Apply language by language on a working copy so later groups see earlier results.
  const working: any = { ...entry };
  const update: Record<string, any> = {};
  const langs = [...new Set(selected.map(p => p.lang || null))];
  try {
    for (const lang of langs) {
      const group = selected.filter(p => (p.lang || null) === lang).map(p => ({ field: p.field, value: p.value }));
      const changes = normalizeChanges(group, col.fields || [], working.content || {}, lang);
      const partial = applyChanges(working, changes, lang);
      Object.assign(update, partial);
      Object.assign(working, partial);
    }
  } catch (e: any) {
    return fail(res, 400, e.message);
  }
  if (update.content && col.fields && col.fields.length > 0) {
    const errors = validateContent(update.content, col.fields);
    if (errors.length) return fail(res, 400, `Content validation failed — ${errors.join(' · ')}`);
  }
  const meta = { ...(update.meta || entry.meta || {}) };
  if (remaining.length) meta.inline_pending = remaining; else delete meta.inline_pending;
  update.meta = meta;

  const { data: saved, error } = await supabase
    .from('entries').update(update).eq('id', id).eq('version', entry.version).select(ENTRY_COLS).single();
  if (error) {
    if (error.code === 'PGRST116') return fail(res, 409, 'Conflict: this entry was modified by another user. Please refresh and try again.');
    throw error;
  }
  audit(req, 'inline_edit_apply', 'entry', id, { collection: col.slug, fields: selected.map(p => p.field), count: selected.length });
  invalidateCachePattern(`entries:${col.slug}:*`).catch(() => {});
  if (saved.status === 'published') autoTranslateEntryToAllLanguages(id, col.slug).catch(() => { /* logged inside */ });
  res.json({ data: saved, meta: { applied: selected.length, remaining: remaining.length }, timestamp: new Date().toISOString() });
}

export async function discardPendingHandler(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return fail(res, 400, 'Invalid id');
  const entry = await loadEntry(id);
  if (!entry) return fail(res, 404, 'Entry not found');
  const list: PendingChange[] = Array.isArray(entry.meta?.inline_pending) ? entry.meta.inline_pending : [];
  if (!list.length) return fail(res, 400, 'Nothing pending on this entry');
  const { selected, remaining } = selectPending(list, req.body?.indexes);

  const meta = { ...(entry.meta || {}) };
  if (remaining.length) meta.inline_pending = remaining; else delete meta.inline_pending;
  const { data: saved, error } = await supabase
    .from('entries').update({ meta }).eq('id', id).eq('version', entry.version).select(ENTRY_COLS).single();
  if (error) {
    if (error.code === 'PGRST116') return fail(res, 409, 'Conflict: this entry was modified by another user. Please refresh and try again.');
    throw error;
  }
  audit(req, 'inline_edit_discard', 'entry', id, { fields: selected.map(p => p.field), count: selected.length });
  res.json({ data: saved, meta: { discarded: selected.length, remaining: remaining.length }, timestamp: new Date().toISOString() });
}

export const inlineEditRouter: Router = router;
