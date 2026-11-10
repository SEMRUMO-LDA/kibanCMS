/**
 * kibanCMS — Inline editing overlay ("Editar no site")
 *
 * Injected by widgets-loader.js ONLY when the page was opened from the Kiban
 * admin with an editing token (#kiban-edit=…). Visitors never load this file.
 *
 * What it does:
 *   1. Asks the API which entries are behind this URL (GET /inline-edit/resolve)
 *   2. Finds, in the page, the texts and images whose value equals a field of
 *      those entries (or elements tagged data-kiban="collection/slug/field")
 *   3. Lets the admin click a text and type over it, or click an image and
 *      choose a new file; "Guardar" sends the changes (PATCH /inline-edit/entries/:id)
 *
 * In beta mode the API stores the changes as pending (approved in the admin);
 * in "on" mode they go live. The script never touches the page for visitors.
 */
(function () {
  'use strict';
  if (window.__kibanInlineEditor) return;

  var KW = window.KibanWidgets || null;
  var tag = document.currentScript;
  var BASE_URL = (KW && KW.getBaseUrl && KW.getBaseUrl()) || (tag && tag.src ? new URL(tag.src, location.href).origin : null);
  var TENANT_ID = (KW && KW.getTenantId && KW.getTenantId()) || (tag && tag.getAttribute('data-tenant')) || null;
  var TOKEN_KEY = 'kiban-edit-token';
  var UI_ATTR = 'data-kiban-edit-ui';

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function dropToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  if (!BASE_URL || !getToken()) return;
  window.__kibanInlineEditor = true;

  var state = {
    session: null,        // response of /resolve
    path: location.pathname,
    entriesById: {},
    textIndex: {},        // normalised text → [{ entry, field }]
    imageIndex: {},       // url key → [{ entry, field }]
    pending: {},          // "entryId|field" → pending change (same language)
    bindings: [],         // { el, entry, field, kind, origHTML, origSrc… }
    changes: {},          // "entryId|field" → { b, value }
    editing: null,        // { el, b, before }
    saving: false,
    bar: null,
    observer: null
  };

  // ── Helpers ───────────────────────────────────────────────────────
  function norm(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function multiline(s) {
    return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function changeKey(b) { return b.entry.id + '|' + b.field.key; }
  function hasChange(b) { return !!state.changes[changeKey(b)]; }
  function countChanges() { return Object.keys(state.changes).length; }
  function isOurs(el) {
    return !!(el && el.closest && el.closest('[' + UI_ATTR + '],[id^="kiban-"],[id^="stcm"],[class*="silktide"]'));
  }

  function api(method, path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, BASE_URL + path);
    xhr.setRequestHeader('X-Kiban-Edit', getToken() || '');
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
    var isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body && !isForm) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 30000;
    xhr.onload = function () {
      var json = null;
      try { json = JSON.parse(xhr.responseText); } catch (e) { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) cb(null, json ? json.data : null, xhr.status);
      else cb(new Error((json && json.error && json.error.message) || ('HTTP ' + xhr.status)), null, xhr.status);
    };
    xhr.onerror = xhr.ontimeout = function () { cb(new Error('Sem ligação ao Kiban'), null, 0); };
    xhr.send(body ? (isForm ? body : JSON.stringify(body)) : null);
  }

  // ── Session (which entries are behind this page) ─────────────────
  function parseRef(v) {
    var m = /^([a-z0-9-]+)\/([a-z0-9-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(v || '').trim());
    return m ? { col: m[1], slug: m[2], field: m[3] } : null;
  }
  function collectRefs() {
    var refs = {}, nodes = document.querySelectorAll('[data-kiban]');
    for (var i = 0; i < nodes.length; i++) {
      var r = parseRef(nodes[i].getAttribute('data-kiban'));
      if (r) refs[r.col + '/' + r.slug] = 1;
    }
    return Object.keys(refs);
  }
  function findEntry(col, slug) {
    var list = (state.session && state.session.entries) || [];
    for (var i = 0; i < list.length; i++) if (list[i].collection.slug === col && list[i].slug === slug) return list[i];
    return null;
  }

  function loadSession(cb) {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase().split('-')[0];
    var q = '?path=' + encodeURIComponent(location.pathname) + '&lang=' + encodeURIComponent(lang);
    var refs = collectRefs();
    if (refs.length) q += '&refs=' + encodeURIComponent(refs.join(','));
    api('GET', '/api/v1/inline-edit/resolve' + q, null, function (err, data, status) {
      if (err) {
        if (status === 401 || status === 403) {
          dropToken();
          if (KW && KW.exitEditMode) KW.exitEditMode();
          toast(status === 401 ? 'Sessão de edição expirada — abra o site de novo a partir do Kiban.' : err.message, 'error', 6000);
          setTimeout(teardown, 6000);
          return;
        }
        showToolbar();
        setStatus('Sem ligação ao Kiban — ' + err.message, 'error');
        return;
      }
      state.session = data;
      state.path = location.pathname;
      buildIndex();
      showToolbar();
      scan();
      if (cb) cb();
    });
  }

  // ── Index of field values ─────────────────────────────────────────
  function fieldValue(entry, key) {
    var tr = state.session.lang && entry.translation ? entry.translation : null;
    if (key === 'title') return tr && tr._title != null ? tr._title : entry.title;
    if (key === 'excerpt') return entry.excerpt;
    if (key === 'featured_image') return entry.featured_image;
    if (key.indexOf('content.') === 0) {
      var k = key.slice(8);
      if (tr && tr[k] !== undefined) return tr[k];
      return entry.content ? entry.content[k] : undefined;
    }
    return undefined;
  }
  function imageUrlOf(v) {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && typeof v.url === 'string') return v.url;
    return null;
  }
  // Keys under which an image URL is indexed: exact path, the inner URL of an
  // optimiser (/api/v1/img?src=…, /_next/image?url=…) and the file name.
  function imageKeys(url) {
    var keys = [];
    try {
      var u = new URL(url, location.href);
      keys.push(u.origin + u.pathname);
      var inner = u.searchParams.get('url') || u.searchParams.get('src');
      if (inner) {
        try { var iu = new URL(inner, location.href); keys.push(iu.origin + iu.pathname); } catch (e) { /* ignore */ }
      }
      var fname = (inner ? inner.split('?')[0] : u.pathname).split('/').pop();
      if (fname && fname.length >= 12) keys.push('file:' + fname);
    } catch (e) { keys.push(url); }
    return keys;
  }
  function indexHit(entry, field, value) {
    if (field.type === 'image') {
      var url = imageUrlOf(value);
      if (!url) return;
      var ks = imageKeys(url);
      for (var i = 0; i < ks.length; i++) (state.imageIndex[ks[i]] = state.imageIndex[ks[i]] || []).push({ entry: entry, field: field });
    } else if (field.type !== 'richtext' && (typeof value === 'string' || typeof value === 'number')) {
      var k = norm(String(value));
      if (k && k.length <= 5000) (state.textIndex[k] = state.textIndex[k] || []).push({ entry: entry, field: field });
    }
  }
  function buildIndex() {
    state.textIndex = {}; state.imageIndex = {}; state.pending = {}; state.entriesById = {};
    var entries = state.session.entries || [];
    var lang = state.session.lang || null;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      state.entriesById[entry.id] = entry;
      var fieldsByKey = {};
      for (var f = 0; f < entry.fields.length; f++) {
        fieldsByKey[entry.fields[f].key] = entry.fields[f];
        indexHit(entry, entry.fields[f], fieldValue(entry, entry.fields[f].key));
      }
      // Pending values too: after a beta save the page shows the new text while the entry still has the old one
      for (var p = 0; p < (entry.pending || []).length; p++) {
        var pend = entry.pending[p];
        if ((pend.lang || null) !== lang) continue;
        state.pending[entry.id + '|' + pend.field] = pend;
        if (fieldsByKey[pend.field]) indexHit(entry, fieldsByKey[pend.field], pend.value);
      }
    }
  }

  // ── Scan the page ─────────────────────────────────────────────────
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
    HEAD: 1, TITLE: 1, META: 1, LINK: 1, SVG: 1, PATH: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, SOURCE: 1, BR: 1, HR: 1 };

  function imgCandidates(img) {
    var list = [];
    if (img.currentSrc) list.push(img.currentSrc);
    var src = img.getAttribute('src'); if (src) list.push(src);
    var srcset = img.getAttribute('srcset');
    if (srcset) {
      var parts = srcset.split(',');
      for (var i = 0; i < parts.length; i++) { var u = parts[i].trim().split(/\s+/)[0]; if (u) list.push(u); }
    }
    var lazy = ['data-src', 'data-lazy-src', 'data-original'];
    for (var j = 0; j < lazy.length; j++) { var v = img.getAttribute(lazy[j]); if (v) list.push(v); }
    return list;
  }
  function matchImage(img) {
    var cands = imgCandidates(img);
    for (var i = 0; i < cands.length; i++) {
      var ks = imageKeys(cands[i]);
      for (var k = 0; k < ks.length; k++) if (state.imageIndex[ks[k]]) return state.imageIndex[ks[k]][0];
    }
    return null;
  }

  function scan() {
    if (!state.session || !document.body) return;
    unbindAll(true);
    var all = document.body.querySelectorAll('*');
    var textMatches = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP[el.tagName] || el.hasAttribute(UI_ATTR) || el.getAttribute('data-kiban-ie') || isOurs(el)) continue;
      var ref = el.getAttribute('data-kiban');
      if (ref) { bindExplicit(el, ref); continue; }
      if (el.tagName === 'IMG') { var hit = matchImage(el); if (hit) bind(el, hit, 'image'); continue; }
      if (el.childElementCount > 3) continue;
      var text = el.textContent;
      if (!text || text.length > 5200) continue;
      var key = norm(text);
      if (!key) continue;
      var hits = state.textIndex[key];
      if (hits) textMatches.push({ el: el, hits: hits, key: key });
    }
    // Prefer the deepest element holding the text (<h1><span>Title</span></h1> → the span)
    for (var j = 0; j < textMatches.length; j++) {
      var m = textMatches[j], deeper = false;
      for (var k = 0; k < textMatches.length; k++) {
        var o = textMatches[k];
        if (o !== m && o.key === m.key && m.el !== o.el && m.el.contains(o.el)) { deeper = true; break; }
      }
      if (!deeper) bind(m.el, m.hits[0], 'text');
    }
    updateToolbar();
  }

  function bindExplicit(el, ref) {
    var r = parseRef(ref);
    if (!r) return;
    var entry = findEntry(r.col, r.slug);
    if (!entry) return;
    var field = null;
    for (var i = 0; i < entry.fields.length; i++) {
      if (entry.fields[i].key === r.field || entry.fields[i].key === 'content.' + r.field) { field = entry.fields[i]; break; }
    }
    if (!field) return;
    bind(el, { entry: entry, field: field }, (el.tagName === 'IMG' || field.type === 'image') ? 'image' : 'text');
  }

  function bind(el, hit, kind) {
    var b = { el: el, entry: hit.entry, field: hit.field, kind: kind, prevTitle: el.getAttribute('title') };
    if (kind === 'text') { b.origHTML = el.innerHTML; b.original = el.textContent; }
    else { b.origSrc = el.getAttribute('src'); b.origSrcset = el.getAttribute('srcset'); b.origSizes = el.getAttribute('sizes'); b.origBg = el.style.backgroundImage; }
    el.setAttribute('data-kiban-ie', hit.entry.id + '|' + hit.field.key);
    el.classList.add('kiban-ie-target');
    if (kind === 'image') el.classList.add('kiban-ie-image');
    var tip = hit.field.label + ' · ' + hit.entry.collection.name;
    if (hit.field.type === 'richtext') { el.classList.add('kiban-ie-locked'); tip = 'Texto rico — por agora edita-se no admin'; }
    var p = state.pending[changeKey(b)];
    if (p) { el.classList.add('kiban-ie-pending'); tip = 'Pendente de aprovação no Kiban: «' + truncate(String(p.value), 80) + '»'; }
    el.setAttribute('title', tip);
    el.addEventListener('click', onTargetClick, true);
    state.bindings.push(b);
  }
  function unbind(b) {
    var el = b.el;
    el.removeEventListener('click', onTargetClick, true);
    el.classList.remove('kiban-ie-target', 'kiban-ie-image', 'kiban-ie-locked', 'kiban-ie-pending', 'kiban-ie-saved', 'kiban-ie-changed', 'kiban-ie-editing');
    el.removeAttribute('data-kiban-ie');
    if (b.prevTitle == null) el.removeAttribute('title'); else el.setAttribute('title', b.prevTitle);
  }
  function unbindAll(keepChanged) {
    var keep = [];
    for (var i = 0; i < state.bindings.length; i++) {
      var b = state.bindings[i];
      if (keepChanged && hasChange(b) && document.body.contains(b.el)) keep.push(b); else unbind(b);
    }
    state.bindings = keep;
  }
  function bindingOf(el) {
    for (var i = 0; i < state.bindings.length; i++) if (state.bindings[i].el === el) return state.bindings[i];
    return null;
  }

  // ── Text editing ─────────────────────────────────────────────────
  function onTargetClick(e) {
    var el = e.currentTarget, b = bindingOf(el);
    if (!b) return;
    if (state.editing && state.editing.el === el) return; // caret placement inside the active editor
    e.preventDefault(); e.stopPropagation();
    if (b.field.type === 'richtext') { toast('Este bloco é texto rico — por agora edita-se no admin do Kiban.', 'info'); return; }
    if (b.kind === 'image') { pickImage(b); return; }
    startEdit(b);
  }
  function startEdit(b) {
    if (state.editing) finishEdit(true);
    var el = b.el;
    state.editing = { el: el, b: b, before: el.innerHTML };
    el.setAttribute('contenteditable', 'plaintext-only');
    if (!el.isContentEditable) el.setAttribute('contenteditable', 'true');
    el.classList.add('kiban-ie-editing');
    el.addEventListener('keydown', onEditKey);
    el.addEventListener('blur', onEditBlur);
    el.addEventListener('paste', onEditPaste);
    el.focus();
    try {
      var r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (err) { /* ignore */ }
    setStatus('A editar «' + b.field.label + '» — Enter guarda, Esc cancela' + (b.field.type === 'textarea' ? ' (Shift+Enter: nova linha)' : ''));
  }
  function onEditKey(e) {
    var ed = state.editing;
    if (!ed) return;
    if (e.key === 'Escape') { e.preventDefault(); ed.el.innerHTML = ed.before; finishEdit(false); }
    else if (e.key === 'Enter' && !e.shiftKey && ed.b.field.type !== 'textarea') { e.preventDefault(); ed.el.blur(); }
  }
  function onEditBlur() { finishEdit(true); }
  function onEditPaste(e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  }
  function finishEdit(commit) {
    var ed = state.editing;
    if (!ed) return;
    state.editing = null;
    var el = ed.el, b = ed.b;
    el.removeEventListener('keydown', onEditKey);
    el.removeEventListener('blur', onEditBlur);
    el.removeEventListener('paste', onEditPaste);
    el.removeAttribute('contenteditable');
    el.classList.remove('kiban-ie-editing');
    if (!commit) el.innerHTML = ed.before;
    var value = b.field.type === 'textarea' ? multiline(el.innerText) : norm(el.innerText);
    if (norm(value) === norm(b.original)) clearChange(b); else recordChange(b, value);
    updateToolbar();
  }
  function recordChange(b, value) {
    state.changes[changeKey(b)] = { b: b, value: value };
    b.el.classList.add('kiban-ie-changed');
    b.el.classList.remove('kiban-ie-saved');
  }
  function clearChange(b) {
    delete state.changes[changeKey(b)];
    b.el.classList.remove('kiban-ie-changed');
  }

  // ── Images ────────────────────────────────────────────────────────
  function pickImage(b) {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.setAttribute(UI_ATTR, ''); input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (f) uploadImage(b, f);
    });
    input.click();
  }
  function uploadImage(b, file) {
    if (file.size > 20 * 1024 * 1024) { toast('Imagem demasiado grande (máximo 20 MB).', 'error'); return; }
    var fd = new FormData();
    fd.append('file', file, file.name);
    if (b.el.alt) fd.append('alt_text', b.el.alt);
    b.el.classList.add('kiban-ie-uploading');
    setStatus('A enviar imagem…');
    api('POST', '/api/v1/inline-edit/media', fd, function (err, data) {
      b.el.classList.remove('kiban-ie-uploading');
      if (err) { toast('Não foi possível enviar a imagem: ' + err.message, 'error'); updateToolbar(); return; }
      applyImage(b.el, data.url);
      recordChange(b, data.url);
      updateToolbar();
    });
  }
  function applyImage(el, url) {
    if (el.tagName === 'IMG') {
      el.removeAttribute('srcset'); el.removeAttribute('sizes');
      el.removeAttribute('data-src'); el.removeAttribute('data-lazy-src'); el.removeAttribute('data-original');
      el.src = url;
      var pic = el.parentElement;
      if (pic && pic.tagName === 'PICTURE') {
        var sources = pic.querySelectorAll('source');
        for (var i = 0; i < sources.length; i++) sources[i].parentNode.removeChild(sources[i]);
      }
    } else {
      el.style.backgroundImage = 'url("' + url + '")';
    }
  }
  function restoreImage(b) {
    var el = b.el;
    if (el.tagName === 'IMG') {
      if (b.origSrc != null) el.setAttribute('src', b.origSrc);
      if (b.origSrcset != null) el.setAttribute('srcset', b.origSrcset);
      if (b.origSizes != null) el.setAttribute('sizes', b.origSizes);
    } else {
      el.style.backgroundImage = b.origBg || '';
    }
  }

  // ── Save / discard ────────────────────────────────────────────────
  function setEntryValue(entry, key, value) {
    if (state.session.lang) {
      entry.translation = entry.translation || {};
      if (key === 'title') entry.translation._title = value;
      else if (key.indexOf('content.') === 0) entry.translation[key.slice(8)] = value;
      return;
    }
    if (key === 'title') entry.title = value;
    else if (key === 'excerpt') entry.excerpt = value;
    else if (key === 'featured_image') entry.featured_image = value;
    else if (key.indexOf('content.') === 0) {
      entry.content = entry.content || {};
      var k = key.slice(8), ex = entry.content[k];
      if (ex && typeof ex === 'object' && !Array.isArray(ex) && 'url' in ex) {
        var copy = {}; for (var p in ex) if (Object.prototype.hasOwnProperty.call(ex, p)) copy[p] = ex[p];
        copy.url = value; entry.content[k] = copy;
      } else entry.content[k] = value;
    }
  }

  function save() {
    if (state.saving) return;
    if (state.editing) finishEdit(true);
    var keys = Object.keys(state.changes);
    if (!keys.length) return;
    var groups = {};
    for (var i = 0; i < keys.length; i++) {
      var c = state.changes[keys[i]];
      (groups[c.b.entry.id] = groups[c.b.entry.id] || []).push(c);
    }
    var ids = Object.keys(groups), pendingSaved = 0, liveSaved = 0, conflict = false;
    state.saving = true; updateToolbar(); setStatus('A guardar…');

    (function next(idx) {
      if (idx >= ids.length) {
        state.saving = false;
        if (pendingSaved) toast(pendingSaved + (pendingSaved === 1 ? ' alteração guardada' : ' alterações guardadas') + ' — aguarda aprovação no Kiban.', 'ok');
        if (liveSaved) toast(liveSaved + (liveSaved === 1 ? ' alteração publicada.' : ' alterações publicadas.'), 'ok');
        if (liveSaved || pendingSaved) buildIndex();
        updateToolbar();
        if (conflict) setStatus('A página mudou no admin entretanto — recarregue para continuar.', 'error');
        return;
      }
      var id = ids[idx], list = groups[id], entry = state.entriesById[id];
      var body = { version: entry.version, lang: state.session.lang || null, changes: [] };
      for (var j = 0; j < list.length; j++) body.changes.push({ field: list[j].b.field.key, value: list[j].value });
      api('PATCH', '/api/v1/inline-edit/entries/' + id, body, function (err, data, status) {
        if (err) {
          if (status === 409) conflict = true;
          toast(err.message, 'error', 6000);
        } else {
          entry.version = data.version;
          for (var k = 0; k < list.length; k++) {
            var ch = list[k], b = ch.b;
            delete state.changes[changeKey(b)];
            b.el.classList.remove('kiban-ie-changed');
            b.el.classList.add('kiban-ie-saved');
            if (b.kind === 'text') { b.original = b.el.textContent; b.origHTML = b.el.innerHTML; }
            else { b.origSrc = b.el.getAttribute('src'); b.origSrcset = null; b.origSizes = null; b.origBg = b.el.style.backgroundImage; }
            if (data.saved === 'pending') {
              b.el.classList.add('kiban-ie-pending');
              b.el.setAttribute('title', 'Pendente de aprovação no Kiban: «' + truncate(String(ch.value), 80) + '»');
              entry.pending = entry.pending || [];
              entry.pending.push({ field: b.field.key, value: ch.value, lang: state.session.lang || null });
            } else {
              setEntryValue(entry, b.field.key, ch.value);
            }
          }
          if (data.saved === 'pending') pendingSaved += list.length; else liveSaved += list.length;
        }
        next(idx + 1);
      });
    })(0);
  }

  function discardAll() {
    if (state.editing) { var ed = state.editing; ed.el.innerHTML = ed.before; finishEdit(false); }
    var keys = Object.keys(state.changes);
    for (var i = 0; i < keys.length; i++) {
      var c = state.changes[keys[i]], b = c.b;
      if (b.kind === 'text') b.el.innerHTML = b.origHTML; else restoreImage(b);
      clearChange(b);
    }
    updateToolbar();
  }

  // ── Toolbar / toasts ──────────────────────────────────────────────
  var STYLES =
    '.kiban-ie-target{outline:2px dashed transparent;outline-offset:3px;cursor:text!important;transition:outline-color .15s,background-color .15s}' +
    '.kiban-ie-target:hover,body.kiban-ie-highlight .kiban-ie-target{outline-color:#06b6d4}' +
    '.kiban-ie-image{cursor:pointer!important}' +
    '.kiban-ie-locked{cursor:not-allowed!important}.kiban-ie-locked:hover{outline-color:#94a3b8}' +
    '.kiban-ie-editing{outline:2px solid #06b6d4!important;background-color:rgba(6,182,212,.08)!important;min-width:1ch}' +
    '.kiban-ie-changed{outline-color:#f59e0b!important;outline-style:solid!important}' +
    '.kiban-ie-saved{outline-color:#22c55e}' +
    '.kiban-ie-pending{outline-color:#a855f7;outline-style:dotted}' +
    '.kiban-ie-uploading{opacity:.5}' +
    '.kiban-ie-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;background:#0f172a;color:#fff;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:500 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:calc(100vw - 24px);box-sizing:border-box}' +
    '.kiban-ie-bar *{box-sizing:border-box;font:inherit}' +
    '.kiban-ie-brand{display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:600}' +
    '.kiban-ie-dot{width:8px;height:8px;border-radius:50%;background:#06b6d4;box-shadow:0 0 0 3px rgba(6,182,212,.25)}' +
    '.kiban-ie-beta{font-size:10px;letter-spacing:.06em;padding:2px 6px;border-radius:999px;background:#334155;color:#cbd5e1}' +
    '.kiban-ie-status{color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw;padding:0 6px;border-left:1px solid #334155}' +
    '.kiban-ie-status.is-error{color:#fca5a5}.kiban-ie-status.is-muted{color:#94a3b8}' +
    '.kiban-ie-btn{appearance:none;border:0;border-radius:999px;padding:7px 12px;background:#1e293b;color:#e2e8f0;cursor:pointer;white-space:nowrap;line-height:1.3}' +
    '.kiban-ie-btn:hover{background:#334155}.kiban-ie-btn:disabled{opacity:.45;cursor:default}' +
    '.kiban-ie-btn.is-on{background:#0e7490}' +
    '.kiban-ie-primary{background:#06b6d4;color:#042f2e;font-weight:600}.kiban-ie-primary:hover:not(:disabled){background:#22d3ee}' +
    '.kiban-ie-icon{padding:6px 10px;font-size:16px;line-height:1}' +
    '.kiban-ie-toast{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:2147483000;padding:10px 14px;border-radius:10px;background:#1e293b;color:#fff;font:500 13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:min(92vw,520px);text-align:center;animation:kibanIeIn .2s ease-out}' +
    '.kiban-ie-toast.is-ok{background:#166534}.kiban-ie-toast.is-error{background:#991b1b}' +
    '@keyframes kibanIeIn{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}' +
    '@media (max-width:640px){.kiban-ie-status{display:none}.kiban-ie-label{display:none}}';

  function injectStyles() {
    if (document.getElementById('kiban-ie-styles')) return;
    var s = document.createElement('style');
    s.id = 'kiban-ie-styles'; s.setAttribute(UI_ATTR, '');
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function showToolbar() {
    if (state.bar) return;
    injectStyles();
    var bar = document.createElement('div');
    bar.className = 'kiban-ie-bar';
    bar.setAttribute(UI_ATTR, '');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Kiban — edição no site');
    var isBeta = !state.session || state.session.mode !== 'on';
    bar.innerHTML =
      '<div class="kiban-ie-brand"><span class="kiban-ie-dot"></span><span class="kiban-ie-label">Edição no site</span>' + (isBeta ? '<span class="kiban-ie-beta">BETA</span>' : '') + '</div>' +
      '<div class="kiban-ie-status" data-role="status"></div>' +
      '<button type="button" class="kiban-ie-btn" data-act="highlight" title="Realçar tudo o que é editável">Realçar</button>' +
      '<button type="button" class="kiban-ie-btn" data-act="discard" disabled>Descartar</button>' +
      '<button type="button" class="kiban-ie-btn kiban-ie-primary" data-act="save" disabled>Guardar</button>' +
      '<button type="button" class="kiban-ie-btn kiban-ie-icon" data-act="exit" title="Sair do modo de edição" aria-label="Sair do modo de edição">×</button>';
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'save') save();
      else if (act === 'discard') discardAll();
      else if (act === 'exit') exit();
      else if (act === 'highlight') { var on = document.body.classList.toggle('kiban-ie-highlight'); btn.classList.toggle('is-on', on); }
    });
    // Clicking the bar must not blur the active editor before its own handlers run
    bar.addEventListener('mousedown', function (e) { if (state.editing && e.target.getAttribute('data-act') !== 'save') e.preventDefault(); });
    document.body.appendChild(bar);
    state.bar = bar;
    updateToolbar();
  }

  function setStatus(text, kind) {
    if (!state.bar) return;
    var el = state.bar.querySelector('[data-role="status"]');
    if (!el) return;
    el.textContent = text;
    el.className = 'kiban-ie-status' + (kind ? ' is-' + kind : '');
  }

  function updateToolbar() {
    if (!state.bar) return;
    var n = countChanges();
    var saveBtn = state.bar.querySelector('[data-act="save"]');
    var discardBtn = state.bar.querySelector('[data-act="discard"]');
    saveBtn.disabled = state.saving || !n;
    saveBtn.textContent = state.saving ? 'A guardar…' : (n ? 'Guardar (' + n + ')' : 'Guardar');
    discardBtn.disabled = state.saving || !n;
    if (state.editing || state.saving || !state.session) return;
    var editable = state.bindings.length;
    if (!editable) { setStatus('Nenhum texto ou imagem editável nesta página', 'muted'); return; }
    if (n) { setStatus(n + (n === 1 ? ' alteração por guardar' : ' alterações por guardar')); return; }
    var s = state.session;
    setStatus(editable + (editable === 1 ? ' elemento editável' : ' elementos editáveis') + ' — clique para editar' +
      (s.lang ? ' · ' + s.lang.toUpperCase() : '') +
      (s.save_mode === 'draft' ? ' · guarda para aprovação' : ' · publica diretamente'), 'muted');
  }

  var toastTimer = null, toastEl = null;
  function toast(text, kind, ms) {
    injectStyles();
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = document.createElement('div');
    toastEl.className = 'kiban-ie-toast' + (kind && kind !== 'info' ? ' is-' + kind : '');
    toastEl.setAttribute(UI_ATTR, '');
    toastEl.setAttribute('role', 'status');
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); }, ms || (kind === 'error' ? 6000 : 3500));
  }

  function exit() {
    var n = countChanges();
    if (n && !confirm('Tem ' + n + (n === 1 ? ' alteração' : ' alterações') + ' por guardar. Sair sem guardar?')) return;
    dropToken();
    if (KW && KW.exitEditMode) KW.exitEditMode();
    teardown();
    location.reload();
  }
  function teardown() {
    if (state.editing) finishEdit(false);
    unbindAll(false);
    if (state.observer) state.observer.disconnect();
    if (state.bar && state.bar.parentNode) state.bar.parentNode.removeChild(state.bar);
    state.bar = null;
    document.body.classList.remove('kiban-ie-highlight');
    window.__kibanInlineEditor = false;
  }

  // ── Keep up with the page (SPA navigation, lazy content) ──────────
  var rescanTimer = null;
  function scheduleRescan() {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(function () {
      if (!window.__kibanInlineEditor) return;
      if (state.editing || state.saving) { scheduleRescan(); return; }
      if (location.pathname !== state.path) { loadSession(); return; }
      if (!state.session) return;
      var refs = collectRefs();
      for (var i = 0; i < refs.length; i++) {
        var parts = refs[i].split('/');
        if (!findEntry(parts[0], parts[1])) { loadSession(); return; }
      }
      scan();
    }, 500);
  }
  function watch() {
    if (!window.MutationObserver || !document.body) return;
    state.observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t && t.nodeType !== 1) t = t.parentElement;
        if (!t || isOurs(t) || (t.closest && t.closest('[data-kiban-ie]'))) continue;
        scheduleRescan();
        return;
      }
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleRescan);
    var methods = ['pushState', 'replaceState'];
    for (var m = 0; m < methods.length; m++) {
      (function (name) {
        var orig = history[name];
        if (typeof orig !== 'function') return;
        history[name] = function () { var r = orig.apply(this, arguments); scheduleRescan(); return r; };
      })(methods[m]);
    }
  }

  window.addEventListener('beforeunload', function (e) {
    if (window.__kibanInlineEditor && countChanges()) { e.preventDefault(); e.returnValue = ''; }
  });

  function start() {
    loadSession(function () { watch(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
