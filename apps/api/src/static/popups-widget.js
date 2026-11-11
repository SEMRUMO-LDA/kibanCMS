/**
 * kibanCMS — Popups & announcement bars widget
 *
 * Injected by widgets-loader.js when the site has at least one active popup
 * (add-on "Popups"). Reads its configuration from the bootstrap
 * (KibanWidgets.getConfig('popups')), falling back to /api/v1/popups/config.
 *
 * Shows at most one bar and one popup per page view, honouring each item's
 * page targeting, trigger (immediate / delay / scroll / exit intent) and
 * frequency (always / once per session / once every N days). Actions: open a
 * link, WhatsApp, newsletter sign-up (honeypot + optional Turnstile), show a
 * coupon code, or just close.
 *
 * Everything rendered from the CMS is escaped: no HTML ever reaches the page.
 * Nothing is shown while the Kiban site editor is open.
 */
(function () {
  'use strict';
  if (window.__kibanPopupsMounted) return;

  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    if (scripts[i].src && scripts[i].src.indexOf('popups') !== -1) { scriptTag = scripts[i]; break; }
  }
  if (!scriptTag) scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;
  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;
  var BASE_URL = new URL(scriptTag.src, window.location.href).origin;
  var TENANT_ID = scriptTag.getAttribute('data-tenant');
  var KW = window.KibanWidgets || null;
  if (KW && typeof KW.getEditToken === 'function' && KW.getEditToken()) return; // never over the site editor
  window.__kibanPopupsMounted = true;

  var UI_ATTR = 'data-kiban-edit-ui'; // keeps the site editor's scanner away from our markup
  var STORAGE_PREFIX = 'kiban-popup:';
  var Z = 2147482500;

  // ── Helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function setAuth(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
  }
  function fetchConfig(cb) {
    var pre = KW && typeof KW.getConfig === 'function' ? KW.getConfig('popups') : undefined;
    if (pre && pre.items) { cb(pre); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/popups/config');
    setAuth(xhr);
    xhr.timeout = 15000;
    xhr.onload = function () {
      try { var r = JSON.parse(xhr.responseText); cb((r && r.data) || { items: [] }); } catch (e) { cb({ items: [] }); }
    };
    xhr.onerror = xhr.ontimeout = function () { cb({ items: [] }); };
    xhr.send();
  }
  // Same semantics as the API (lib/popups.ts matchesPage)
  function matchesPage(patterns, path) {
    var p = (path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    if (!patterns || !patterns.length) return true;
    for (var i = 0; i < patterns.length; i++) {
      var t = String(patterns[i]).replace(/\/+$/, '') || '/';
      if (t === '*') return true;
      if (t.slice(-2) === '/*') {
        var base = t.slice(0, -2) || '/';
        if (p === base || p.indexOf(base === '/' ? '/' : base + '/') === 0) return true;
      } else if (p === t) return true;
    }
    return false;
  }
  function canShow(it) {
    try {
      if (it.frequency === 'session') return !sessionStorage.getItem(STORAGE_PREFIX + it.id);
      if (it.frequency === 'days') {
        var t = Number(localStorage.getItem(STORAGE_PREFIX + it.id) || 0);
        return !t || Date.now() - t > (it.frequency_days || 7) * 86400000;
      }
    } catch (e) { /* storage blocked: show */ }
    return true;
  }
  function markShown(it) {
    try {
      if (it.frequency === 'session') sessionStorage.setItem(STORAGE_PREFIX + it.id, '1');
      else if (it.frequency === 'days') localStorage.setItem(STORAGE_PREFIX + it.id, String(Date.now()));
    } catch (e) { /* ignore */ }
  }
  function track(action, it) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({ event: 'kiban_popup', popup_action: action, popup_name: it.name, popup_id: it.id });
      }
    } catch (e) { /* ignore */ }
  }
  function isTouch() { return window.matchMedia && window.matchMedia('(hover: none)').matches; }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ── Trigger ───────────────────────────────────────────────────────
  function arm(it, show) {
    var fired = false;
    function once() { if (fired) return; fired = true; show(); }
    if (it.trigger === 'delay') { setTimeout(once, (it.trigger_value || 0) * 1000); return; }
    if (it.trigger === 'scroll') {
      var target = Math.max(1, Math.min(100, it.trigger_value || 50));
      var onScroll = function () {
        var doc = document.documentElement;
        var max = (doc.scrollHeight - window.innerHeight) || 1;
        if ((window.pageYOffset / max) * 100 >= target) { window.removeEventListener('scroll', onScroll); once(); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return;
    }
    if (it.trigger === 'exit') {
      if (isTouch()) { setTimeout(once, 8000); return; } // no cursor to leave with: a quiet delay instead
      var onOut = function (e) {
        if (!e.relatedTarget && e.clientY <= 0) { document.removeEventListener('mouseout', onOut); once(); }
      };
      document.addEventListener('mouseout', onOut);
      return;
    }
    once();
  }

  // ── Styles ────────────────────────────────────────────────────────
  var STYLES =
    '.kiban-pp-bar{position:fixed;left:0;right:0;z-index:' + Z + ';display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:10px 48px 10px 16px;box-sizing:border-box;font:500 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18)}' +
    '.kiban-pp-bar.is-top{top:0}.kiban-pp-bar.is-bottom{bottom:0}' +
    '.kiban-pp-bar .kiban-pp-text{margin:0}.kiban-pp-bar strong{font-weight:700}' +
    '.kiban-pp-btn{appearance:none;border:0;border-radius:999px;padding:8px 16px;font:600 13px/1.2 inherit;font-family:inherit;cursor:pointer;text-decoration:none;display:inline-block;white-space:nowrap}' +
    '.kiban-pp-close{position:absolute;top:50%;right:10px;transform:translateY(-50%);appearance:none;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;width:32px;height:32px;border-radius:50%;cursor:pointer;opacity:.8}' +
    '.kiban-pp-close:hover{opacity:1;background:rgba(127,127,127,.15)}' +
    '.kiban-pp-backdrop{position:fixed;inset:0;z-index:' + (Z + 1) + ';background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '.kiban-pp-card{position:relative;width:min(92vw,440px);max-height:90vh;overflow:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4);font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-sizing:border-box}' +
    '.kiban-pp-card .kiban-pp-close{top:10px;right:10px;transform:none}' +
    '.kiban-pp-img{display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:16px 16px 0 0}' +
    '.kiban-pp-body{padding:24px 24px 22px}' +
    '.kiban-pp-title{margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:700}' +
    '.kiban-pp-text{margin:0 0 16px}' +
    '.kiban-pp-form{display:flex;flex-direction:column;gap:10px;margin-top:6px}' +
    '.kiban-pp-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.4);font:inherit;background:transparent;color:inherit}' +
    '.kiban-pp-consent{display:flex;align-items:flex-start;gap:8px;font-size:13px;opacity:.9}' +
    '.kiban-pp-hp{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}' +
    '.kiban-pp-coupon{display:flex;align-items:center;gap:10px;margin:0 0 14px}' +
    '.kiban-pp-code{font:700 20px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;padding:10px 14px;border:2px dashed currentColor;border-radius:10px}' +
    '.kiban-pp-msg{margin:10px 0 0;font-size:13px}.kiban-pp-msg.is-error{color:#dc2626}' +
    '.kiban-pp-light{background:#fff;color:#111827}.kiban-pp-dark{background:#0f172a;color:#f8fafc}' +
    '.kiban-pp-anim{animation:kibanPpIn .25s ease-out}' +
    '@keyframes kibanPpIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@media (max-width:640px){.kiban-pp-bar{font-size:13px;padding-right:44px}.kiban-pp-title{font-size:19px}.kiban-pp-body{padding:20px 18px 18px}}';
  function injectStyles() {
    if (document.getElementById('kiban-pp-styles')) return;
    var s = document.createElement('style');
    s.id = 'kiban-pp-styles'; s.setAttribute(UI_ATTR, '');
    s.textContent = STYLES;
    document.head.appendChild(s);
  }
  function accentStyles(it) {
    var accent = it.accent || (it.theme === 'dark' ? '#22d3ee' : '#0f172a');
    var fg = it.theme === 'dark' ? '#0f172a' : '#ffffff';
    return 'background:' + accent + ';color:' + fg + ';';
  }

  // ── Actions ───────────────────────────────────────────────────────
  function buttonHtml(it) {
    if (!it.button_label || it.action === 'newsletter') return '';
    if (it.action === 'link') {
      var ext = /^https?:\/\//i.test(it.url) && it.url.indexOf(location.origin) !== 0;
      return '<a class="kiban-pp-btn" data-pp-act="link" href="' + esc(it.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + ' style="' + accentStyles(it) + '">' + esc(it.button_label) + '</a>';
    }
    if (it.action === 'whatsapp') {
      var wa = 'https://wa.me/' + encodeURIComponent(it.whatsapp.replace(/^\+/, '')) + (it.whatsapp_message ? '?text=' + encodeURIComponent(it.whatsapp_message) : '');
      return '<a class="kiban-pp-btn" data-pp-act="whatsapp" href="' + esc(wa) + '" target="_blank" rel="noopener" style="' + accentStyles(it) + '">' + esc(it.button_label) + '</a>';
    }
    return '<button type="button" class="kiban-pp-btn" data-pp-act="' + esc(it.action) + '" style="' + accentStyles(it) + '">' + esc(it.button_label) + '</button>';
  }
  function couponHtml(it) {
    return '<div class="kiban-pp-coupon"><span class="kiban-pp-code" data-pp-code>' + esc(it.coupon_code) + '</span>' +
      '<button type="button" class="kiban-pp-btn" data-pp-act="copy" style="' + accentStyles(it) + '">Copiar</button></div>';
  }
  function newsletterHtml(it) {
    return '<form class="kiban-pp-form" data-pp-form novalidate>' +
      '<input class="kiban-pp-input" type="email" name="email" placeholder="O seu email" autocomplete="email" required>' +
      '<input class="kiban-pp-hp" type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      (it.consent_text ? '<label class="kiban-pp-consent"><input type="checkbox" name="consent" required> <span>' + esc(it.consent_text) + '</span></label>' : '') +
      '<div data-pp-turnstile></div>' +
      '<button type="submit" class="kiban-pp-btn" style="' + accentStyles(it) + '">' + esc(it.button_label || 'Subscrever') + '</button>' +
      '<p class="kiban-pp-msg" data-pp-msg hidden></p></form>';
  }
  function copyText(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(false); }); return; }
    try {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); cb(!!ok);
    } catch (e) { cb(false); }
  }

  var turnstileSiteKey = '';
  var turnstileLoading = false;
  function mountTurnstile(container, onToken) {
    if (!turnstileSiteKey || !container) return;
    function render() {
      try { window.turnstile.render(container, { sitekey: turnstileSiteKey, callback: onToken, 'error-callback': function () { onToken(''); }, 'expired-callback': function () { onToken(''); } }); } catch (e) { /* ignore */ }
    }
    if (window.turnstile && window.turnstile.render) { render(); return; }
    if (!turnstileLoading) {
      turnstileLoading = true;
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = render;
      document.head.appendChild(s);
    } else {
      var wait = setInterval(function () { if (window.turnstile && window.turnstile.render) { clearInterval(wait); render(); } }, 200);
      setTimeout(function () { clearInterval(wait); }, 15000);
    }
  }
  function submitNewsletter(form, it) {
    var msg = form.querySelector('[data-pp-msg]');
    var email = (form.querySelector('[name="email"]').value || '').trim();
    var consent = form.querySelector('[name="consent"]');
    function say(text, error) { msg.hidden = false; msg.textContent = text; msg.className = 'kiban-pp-msg' + (error ? ' is-error' : ''); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('Escreva um email válido.', true); return; }
    if (consent && !consent.checked) { say('Confirme que aceita receber os emails.', true); return; }
    var body = { email: email, source: it.newsletter_source || 'popup', _hp: form.querySelector('[name="_hp"]').value || '' };
    if (form.__turnstileToken) body.turnstile_token = form.__turnstileToken;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + '/api/v1/newsletter/subscribe');
    setAuth(xhr);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;
    xhr.onload = function () {
      btn.disabled = false;
      var r = null;
      try { r = JSON.parse(xhr.responseText); } catch (e) { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        var pending = r && r.data && r.data.pending_confirmation;
        form.innerHTML = '<p class="kiban-pp-msg">' + (pending ? 'Quase: confirme a subscrição no email que acabámos de enviar.' : 'Obrigado! Subscrição registada.') + '</p>';
        track('subscribe', it);
        markShown(it);
      } else {
        say((r && r.error && r.error.message) || 'Não foi possível subscrever. Tente mais tarde.', true);
      }
    };
    xhr.onerror = xhr.ontimeout = function () { btn.disabled = false; say('Sem ligação. Tente mais tarde.', true); };
    xhr.send(JSON.stringify(body));
  }

  function wireActions(root, it, close) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-pp-act]') : null;
      if (!el) return;
      var act = el.getAttribute('data-pp-act');
      if (act === 'close') { e.preventDefault(); track('close', it); close(); return; }
      if (act === 'link' || act === 'whatsapp') { track('click', it); markShown(it); return; } // let the anchor navigate
      if (act === 'coupon') {
        e.preventDefault();
        var holder = root.querySelector('[data-pp-coupon-holder]');
        if (holder && !holder.innerHTML) { holder.innerHTML = couponHtml(it); el.style.display = 'none'; track('click', it); }
        return;
      }
      if (act === 'copy') {
        e.preventDefault();
        var code = root.querySelector('[data-pp-code]');
        copyText(code ? code.textContent : it.coupon_code, function (ok) { el.textContent = ok ? 'Copiado ✓' : 'Copie: ' + it.coupon_code; });
        markShown(it);
        return;
      }
    });
    var form = root.querySelector('[data-pp-form]');
    if (form) {
      form.addEventListener('submit', function (e) { e.preventDefault(); submitNewsletter(form, it); });
      mountTurnstile(form.querySelector('[data-pp-turnstile]'), function (token) { form.__turnstileToken = token; });
    }
  }

  // ── Bar ───────────────────────────────────────────────────────────
  function renderBar(it) {
    injectStyles();
    var bar = document.createElement('div');
    bar.className = 'kiban-pp-bar kiban-pp-' + it.theme + ' is-' + it.position + (reducedMotion() ? '' : ' kiban-pp-anim');
    bar.setAttribute(UI_ATTR, ''); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', it.name);
    if (it.accent) bar.style.borderTop = it.position === 'bottom' ? '3px solid ' + it.accent : '';
    if (it.accent && it.position === 'top') bar.style.borderBottom = '3px solid ' + it.accent;
    bar.innerHTML =
      '<p class="kiban-pp-text">' + (it.title ? '<strong>' + esc(it.title) + '</strong> ' : '') + nl2br(it.text) + '</p>' +
      (it.action === 'coupon' ? '<span data-pp-coupon-holder></span>' : '') +
      buttonHtml(it) +
      '<button type="button" class="kiban-pp-close" data-pp-act="close" aria-label="Fechar">×</button>';
    var padProp = it.position === 'top' ? 'paddingTop' : 'paddingBottom';
    var prevPad = document.documentElement.style[padProp];
    function close() {
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      document.documentElement.style[padProp] = prevPad;
      markShown(it);
    }
    wireActions(bar, it, close);
    document.body.appendChild(bar);
    // Push the page so the bar does not cover the first content line
    document.documentElement.style[padProp] = bar.offsetHeight + 'px';
    track('view', it);
    if (it.frequency !== 'always') markShown(it);
  }

  // ── Popup ─────────────────────────────────────────────────────────
  function renderPopup(it) {
    injectStyles();
    var backdrop = document.createElement('div');
    backdrop.className = 'kiban-pp-backdrop'; backdrop.setAttribute(UI_ATTR, '');
    var titleId = 'kiban-pp-title-' + it.id.slice(0, 8);
    backdrop.innerHTML =
      '<div class="kiban-pp-card kiban-pp-' + it.theme + (reducedMotion() ? '' : ' kiban-pp-anim') + '" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '" tabindex="-1">' +
        (it.image ? '<img class="kiban-pp-img" src="' + esc(it.image) + '" alt="">' : '') +
        '<div class="kiban-pp-body">' +
          '<h2 class="kiban-pp-title" id="' + titleId + '">' + esc(it.title || it.name) + '</h2>' +
          (it.text ? '<p class="kiban-pp-text">' + nl2br(it.text) + '</p>' : '') +
          (it.action === 'coupon' ? '<span data-pp-coupon-holder></span>' : '') +
          (it.action === 'newsletter' ? newsletterHtml(it) : buttonHtml(it)) +
        '</div>' +
        '<button type="button" class="kiban-pp-close" data-pp-act="close" aria-label="Fechar">×</button>' +
      '</div>';
    var prevOverflow = document.documentElement.style.overflow;
    var prevFocus = document.activeElement;
    function onKey(e) { if (e.key === 'Escape') { track('close', it); close(); } }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.documentElement.style.overflow = prevOverflow;
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* ignore */ }
      markShown(it);
    }
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) { track('close', it); close(); } });
    document.addEventListener('keydown', onKey);
    wireActions(backdrop, it, close);
    document.body.appendChild(backdrop);
    document.documentElement.style.overflow = 'hidden';
    var card = backdrop.querySelector('.kiban-pp-card');
    try { card.focus(); } catch (e) { /* ignore */ }
    track('view', it);
    if (it.frequency !== 'always') markShown(it);
  }

  // ── Init ──────────────────────────────────────────────────────────
  function start(cfg) {
    turnstileSiteKey = (cfg && cfg.turnstileSiteKey) || '';
    var items = (cfg && cfg.items) || [];
    var bar = null, popup = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !matchesPage(it.pages, location.pathname) || !canShow(it)) continue;
      if (it.kind === 'bar') { if (!bar) bar = it; }
      else if (!popup) popup = it;
    }
    if (bar) arm(bar, function () { renderBar(bar); });
    if (popup) arm(popup, function () { renderPopup(popup); });
  }
  function boot() { fetchConfig(start); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
