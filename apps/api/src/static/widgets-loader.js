/**
 * kibanCMS Widget Loader
 *
 * Universal auto-loader for all kibanCMS frontend widgets.
 * Checks which add-ons are installed and enabled, then dynamically injects
 * their widget scripts. Frontends only need ONE script tag:
 *
 *   <script src="https://your-cms.com/api/v1/widgets/loader.js" data-api-key="YOUR_KEY"></script>
 *
 * Optional attributes:
 *   data-tenant="TENANT_ID"   — multi-tenant resolution
 *
 * Widgets loaded automatically when enabled:
 *   - Cookie Notice (Silktide Consent Manager)
 *   - Accessibility Widget (EAA 2025)
 *   - WhatsApp Chat Widget
 *   - Language Switcher (i18n)
 */
(function () {
  'use strict';

  // ── Config from script tag ──────────────────────────────────────────
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var TENANT_ID = scriptTag.getAttribute('data-tenant');

  // ── Widget registry ─────────────────────────────────────────────────
  // Maps addon_id → widget script path (relative to BASE_URL)
  var WIDGET_MAP = {
    'cookie-notice':    '/api/v1/cookie-notice/widget.js',
    'accessibility':    '/api/v1/accessibility/widget.js',
    'whatsapp-widget':  '/api/v1/whatsapp-widget/widget.js',
    'i18n':             '/api/v1/i18n/widget.js',
  };

  // ── Fetch enabled widgets ───────────────────────────────────────────
  function fetchEnabledWidgets(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/widgets/enabled');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // Cluster customisation written by the admin (accent colour + which
  // widgets join the cluster). Fetched in parallel with /widgets/enabled
  // so the first arrangeStack pass has the right inclusion list and we
  // don't render with one config and then re-render with another.
  function fetchClusterConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/widgets/cluster-config');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Inject widget script ────────────────────────────────────────────
  function injectWidget(widgetPath) {
    var script = document.createElement('script');
    script.src = BASE_URL + widgetPath;
    script.setAttribute('data-api-key', API_KEY);
    if (TENANT_ID) script.setAttribute('data-tenant', TENANT_ID);
    script.async = true;
    document.head.appendChild(script);
  }

  // Selectors of every widget we know how to clusterise. Used by the
  // pre-hide stylesheet below (we don't want the floating button to flash
  // for ~1s before the cluster forms), and by the arrange logic to know
  // what to reveal again when a widget ends up standalone.
  var KNOWN_WIDGET_SELECTORS = {
    'cookie-notice':   '#stcm-icon',
    'accessibility':   '#kiban-a11y-btn',
    'whatsapp-widget': '#kiban-whatsapp-btn',
    'i18n':            '#kiban-i18n-widget',
  };

  // Inject `visibility: hidden` for every known widget root *before* any
  // widget script runs. The widgets append their button to <body> right
  // after their config fetch resolves, which can be ~300ms; the cluster
  // doesn't form until both clusterables register, which can be 2–3s if
  // Silktide is slow. Without pre-hide, the standalone button paints for
  // a moment and then snaps into the cluster — a noisy flash. Hiding via
  // visibility (not display:none) keeps layout stable so the move-to-stash
  // step doesn't reflow.
  function injectPreHide() {
    if (document.getElementById('kiban-pre-hide')) return;
    var style = document.createElement('style');
    style.id = 'kiban-pre-hide';
    var selectors = Object.keys(KNOWN_WIDGET_SELECTORS).map(function (k) {
      return KNOWN_WIDGET_SELECTORS[k];
    }).join(', ');
    style.textContent = selectors
      + ' { visibility: hidden !important; pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  injectPreHide();

  // Tracks how many widgets we expect to register so arrangeStack can
  // hold off revealing standalone widgets until everyone has reported in
  // (otherwise a fast-registering one shows alone for ~1s, then snaps
  // into the cluster when a slow-registering one finally arrives — the
  // user-visible flash). Falls back to revealing after a short timeout
  // so a single misbehaving widget can't keep the others hidden forever.
  var expectedRegistrations = 0;
  var bootTime = Date.now();
  var REVEAL_TIMEOUT_MS = 1500;
  function arrangeReady() {
    return Object.keys(stackItems).length >= expectedRegistrations
        || Date.now() - bootTime >= REVEAL_TIMEOUT_MS;
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    bootTime = Date.now();
    // Kick the cluster config fetch first so its accent colour lands on
    // :root before any widget renders. The script-tag fetches don't wait
    // for it — we don't want a missing config to block the page either.
    fetchClusterConfig(function (err, res) {
      if (!err && res && res.data) applyClusterConfig(res.data);
    });
    fetchEnabledWidgets(function (err, res) {
      if (err || !res || !res.data) return;
      var enabledAddons = res.data;
      expectedRegistrations = enabledAddons.length;
      enabledAddons.forEach(function (addonId) {
        var widgetPath = WIDGET_MAP[addonId];
        if (widgetPath) injectWidget(widgetPath);
      });
    });
    // Some widgets register late (Silktide pulls its bundle from a CDN,
    // which can take 1–3s on slow networks). The 200ms register debounce
    // would still arrange after each registration, but adding a few
    // additional sweeps gives us a deterministic settle if anything
    // mutates the DOM out of band — e.g. Silktide re-rendering its icon
    // when the consent banner closes. Cheap and idempotent.
    [1500, 3500, 6000].forEach(function (delay) {
      setTimeout(function () {
        if (Object.keys(stackItems).length > 0) arrangeStack();
      }, delay);
    });
  }

  // Cluster config — populated by fetchClusterConfig. The defaults match
  // the admin's defaults so a tenant that never opens the customisation
  // page gets the same behaviour as one with an explicit save.
  var clusterConfig = {
    accentColor: null,
    includedWidgets: ['cookie-notice', 'accessibility', 'whatsapp-widget', 'i18n'],
  };
  function applyClusterConfig(cfg) {
    if (cfg && typeof cfg === 'object') {
      if (typeof cfg.accentColor !== 'undefined') clusterConfig.accentColor = cfg.accentColor;
      if (Array.isArray(cfg.includedWidgets))    clusterConfig.includedWidgets = cfg.includedWidgets;
    }
    var root = document.documentElement;
    if (clusterConfig.accentColor) {
      root.style.setProperty('--kiban-widget-tint', clusterConfig.accentColor);
    } else {
      root.style.removeProperty('--kiban-widget-tint');
    }
    // Re-arrange in case the inclusion list changed widgets that were
    // already registered when the config arrived.
    if (Object.keys(stackItems).length > 0) {
      clearTimeout(stackTimer);
      stackTimer = setTimeout(arrangeStack, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ── Widget stacking orchestrator ────────────────────────────────────
  // Each widget registers itself once its floating element is in the DOM.
  // When 0–1 widgets share a corner we just position them at the edge.
  // From 2 widgets onward, they collapse into a single liquid-glass trigger
  // that expands a vertical panel of proxy buttons (FAB cluster pattern).
  // Debounced so a burst of registrations settles into one layout pass.
  //
  // Widget contract:
  //   KibanWidgets.register('cookie-notice', {
  //     selector: '#stcm-icon',
  //     corner:   'bottomLeft' | 'bottom-left' | 'bl',
  //     height:   44,
  //     // Optional cluster overrides — recommended for crisp icons/labels:
  //     cluster: {
  //       label:      'Cookies',
  //       icon:       '<svg ...>...</svg>',
  //       onActivate: function () { /* open the widget's panel */ },
  //     },
  //   });
  //
  // If `cluster` is omitted the loader clones the registered element's
  // first SVG as the icon and dispatches a `click()` to it on activation.

  var STACK_GAP = 12;   // px between stacked widgets
  var STACK_EDGE = 16;  // px from viewport edge
  var CLUSTER_THRESHOLD = 2; // ≥N clusterable widgets in a corner ⇒ collapse
  // Lower index = closer to the trigger / corner edge.
  var STACK_ORDER = ['accessibility', 'cookie-notice', 'whatsapp-widget', 'i18n'];
  // i18n's pill expands in-place — it doesn't fit the simple "icon →
  // opens panel" cluster contract, so we never put it inside the cluster
  // even when the admin marks it as included. The admin checkbox still
  // controls whether it's *visible* (left here intentionally so a future
  // version can drop this exemption when we ship a sub-menu).
  var CLUSTER_KIND_EXEMPT = ['i18n'];

  var stackItems = {};
  var clusters = {};   // per-corner: { trigger, panel, open }
  var stackTimer = null;

  function normalizeCorner(c) {
    var s = String(c || '').toLowerCase().replace(/[-_\s]/g, '');
    if (s === 'bottomleft' || s === 'bl') return 'bl';
    if (s === 'bottomright' || s === 'br') return 'br';
    if (s === 'topleft' || s === 'tl') return 'tl';
    if (s === 'topright' || s === 'tr') return 'tr';
    return 'br';
  }

  // ── Liquid glass + cluster styles ───────────────────────────────────
  // Single style tag, idempotent. backdrop-filter falls back to a solid
  // dark fill on browsers that lack support (~3% in 2026). Tenants can
  // tint the glass via `:root { --kiban-widget-tint: #color }`.
  function ensureClusterStyles() {
    if (document.getElementById('kiban-cluster-styles')) return;
    var style = document.createElement('style');
    style.id = 'kiban-cluster-styles';
    style.textContent = [
      // iOS-style materialDark: a dark translucent base reads on both
      // light and dark host backgrounds without us having to sniff
      // luminance. Light glass on a white hero loses all contrast — that
      // was the bug. Tint mixes against this same dark base so brand
      // colours never wash out the icon either.
      '.kiban-glass {',
      '  background: rgba(20, 20, 22, 0.55);',
      '  -webkit-backdrop-filter: blur(22px) saturate(1.7);',
      '  backdrop-filter: blur(22px) saturate(1.7);',
      '  border: 1px solid rgba(255, 255, 255, 0.14);',
      '  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08);',
      '}',
      '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {',
      '  .kiban-glass { background: rgba(20, 20, 22, 0.92); }',
      '}',
      ':root:not([data-kiban-no-tint]) .kiban-glass {',
      '  background: color-mix(in srgb, var(--kiban-widget-tint, transparent) 22%, rgba(20, 20, 22, 0.55));',
      '}',
      // Trigger is fixed to the corner. Items inside the panel are
      // statically positioned so they actually participate in the
      // panel's flex layout — `position: fixed` removes elements from
      // normal flow and was making the proxies pile on top of each
      // other instead of stacking in a clean column.
      '.kiban-cluster-trigger {',
      '  position: fixed;',
      '  z-index: 2147483600;',
      '  width: 44px; height: 44px;',
      '  border-radius: 50%;',
      '  display: flex; align-items: center; justify-content: center;',
      '  cursor: pointer;',
      '  color: #fff;',
      '  padding: 0;',
      '  transition: transform 0.18s ease, opacity 0.2s ease;',
      '}',
      '.kiban-cluster-item {',
      '  flex: 0 0 44px;',
      '  width: 44px; height: 44px;',
      '  border-radius: 50%;',
      '  display: flex; align-items: center; justify-content: center;',
      '  cursor: pointer;',
      '  color: #fff;',
      '  padding: 0;',
      '  transition: transform 0.18s ease, opacity 0.2s ease;',
      '}',
      '.kiban-cluster-trigger:hover { transform: scale(1.06); }',
      '.kiban-cluster-trigger:active { transform: scale(0.94); }',
      '.kiban-cluster-trigger[aria-expanded="true"] { transform: rotate(180deg); }',
      '.kiban-cluster-trigger svg, .kiban-cluster-item svg, .kiban-cluster-item img {',
      '  width: 22px; height: 22px;',
      '  pointer-events: none;',
      '  filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.5));',
      '}',
      '.kiban-cluster-item svg, .kiban-cluster-item img { width: 22px; height: 22px; }',
      // Don't override the SVG's own fill/stroke — each glyph declares
      // currentColor on the right elements, and forcing fill:currentColor
      // on every path/circle/line turned outline icons (a11y, sliders) into
      // featureless white blobs.
      '.kiban-cluster-panel {',
      '  position: fixed;',
      '  display: flex; flex-direction: column; gap: ' + STACK_GAP + 'px;',
      '  z-index: 2147483599;',
      '  pointer-events: none;',
      '}',
      '.kiban-cluster-panel[data-open="true"] { pointer-events: auto; }',
      '.kiban-cluster-item {',
      '  opacity: 0;',
      '  transform: translateY(8px) scale(0.85);',
      '  pointer-events: none;',
      '  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.2, 0.9, 0.2, 1);',
      '}',
      '.kiban-cluster-panel[data-open="true"] .kiban-cluster-item {',
      '  opacity: 1;',
      '  transform: translateY(0) scale(1);',
      '  pointer-events: auto;',
      '}',
      '.kiban-cluster-item:hover { transform: translateY(0) scale(1.06); }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .kiban-cluster-trigger, .kiban-cluster-item { transition: none; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Sliders / preferences glyph — doesn't read as "settings/account" the way
  // a gear does, which matches the "site preferences" semantic better.
  var TRIGGER_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" '
    + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true">'
    + '<line x1="4" y1="6" x2="13" y2="6"/><line x1="17" y1="6" x2="20" y2="6"/>'
    + '<circle cx="15" cy="6" r="2" fill="currentColor"/>'
    + '<line x1="4" y1="12" x2="7" y2="12"/><line x1="11" y1="12" x2="20" y2="12"/>'
    + '<circle cx="9" cy="12" r="2" fill="currentColor"/>'
    + '<line x1="4" y1="18" x2="13" y2="18"/><line x1="17" y1="18" x2="20" y2="18"/>'
    + '<circle cx="15" cy="18" r="2" fill="currentColor"/></svg>';

  function cloneIconFor(item) {
    if (item.cluster && item.cluster.icon) return item.cluster.icon;
    var el = document.querySelector(item.selector);
    if (el) {
      var svg = el.querySelector('svg, img');
      if (svg) return svg.outerHTML;
    }
    return '<span style="font:600 11px/1 -apple-system,sans-serif;letter-spacing:.04em">'
         + (item.cluster && item.cluster.label ? item.cluster.label.slice(0, 2).toUpperCase() : '•')
         + '</span>';
  }

  function activateItem(item) {
    if (item.cluster && typeof item.cluster.onActivate === 'function') {
      try { item.cluster.onActivate(); return; } catch (_) {}
    }
    var el = document.querySelector(item.selector);
    if (!el) return;
    // Programmatic .click() fires even when display:none, but fall back to
    // a clickable child if the wrapper itself doesn't carry the handler.
    var clickable = el.matches('button, a, [role="button"]')
      ? el
      : (el.querySelector('button, a, [role="button"]') || el);
    try { clickable.click(); } catch (_) {}
  }

  function buildTrigger(corner) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kiban-cluster-trigger kiban-glass';
    btn.id = 'kiban-cluster-trigger-' + corner;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'kiban-cluster-panel-' + corner);
    btn.setAttribute('aria-label', 'Site preferences');
    btn.innerHTML = TRIGGER_ICON_SVG;
    return btn;
  }

  function buildPanel(corner) {
    var panel = document.createElement('div');
    panel.className = 'kiban-cluster-panel';
    panel.id = 'kiban-cluster-panel-' + corner;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('data-open', 'false');
    return panel;
  }

  function positionCluster(corner, c) {
    var vProp = corner.charAt(0) === 'b' ? 'bottom' : 'top';
    var hProp = corner.charAt(1) === 'l' ? 'left' : 'right';
    var oppV = vProp === 'bottom' ? 'top' : 'bottom';
    var oppH = hProp === 'left' ? 'right' : 'left';
    c.trigger.style[vProp] = STACK_EDGE + 'px';
    c.trigger.style[hProp] = STACK_EDGE + 'px';
    c.trigger.style[oppV] = '';
    c.trigger.style[oppH] = '';
    c.panel.style[hProp] = STACK_EDGE + 'px';
    c.panel.style[oppH] = '';
    if (vProp === 'bottom') {
      c.panel.style.bottom = (STACK_EDGE + 44 + STACK_GAP) + 'px';
      c.panel.style.top = '';
      c.panel.style.flexDirection = 'column-reverse';
    } else {
      c.panel.style.top = (STACK_EDGE + 44 + STACK_GAP) + 'px';
      c.panel.style.bottom = '';
      c.panel.style.flexDirection = 'column';
    }
  }

  function setClusterOpen(corner, open) {
    var c = clusters[corner];
    if (!c) return;
    c.open = open;
    c.panel.setAttribute('data-open', open ? 'true' : 'false');
    c.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    // Drive the exempt-shift CSS rule. Per-corner attribute so multiple
    // clusters don't fight each other if a tenant ever ends up with both
    // bottom-left and bottom-right collapsed columns.
    var attr = 'data-kiban-cluster-' + corner + '-open';
    if (open) {
      document.body.setAttribute(attr, 'true');
    } else {
      document.body.removeAttribute(attr);
    }
  }

  // Off-screen container for clusterised widgets' original elements. Trying
  // to display:none / visibility:hidden them in place fought a losing
  // battle against widget-injected inline styles (Silktide re-asserts its
  // cssText, the a11y widget builds its button with !important inline rules
  // for position/z-index, etc.). Yanking the element out of normal flow and
  // pushing it 99999px off-screen sidesteps all of that — JS .click() still
  // fires and any panel the widget opens uses position:fixed so it lands at
  // the right viewport coordinates regardless of where its trigger lives.
  function getStash() {
    var stash = document.getElementById('kiban-cluster-stash');
    if (!stash) {
      stash = document.createElement('div');
      stash.id = 'kiban-cluster-stash';
      stash.setAttribute('aria-hidden', 'true');
      stash.style.cssText =
        'position:absolute;left:-99999px;top:-99999px;width:0;height:0;'
        + 'overflow:hidden;pointer-events:none;';
      document.body.appendChild(stash);
    }
    return stash;
  }

  // Mapping of selector → original parent so destroyCluster can put each
  // element back where the widget originally appended it.
  var stashedFrom = {};
  var stashedSelectors = {}; // selector → true while clustered

  function stashElement(selector) {
    var stash = getStash();
    // Use querySelectorAll — Silktide and other widgets sometimes recreate
    // their floating element (e.g. when the consent banner reopens),
    // leaving the old one in the stash and a fresh one in the body. We
    // need to grab everything that matches.
    var matches = document.querySelectorAll(selector);
    var moved = 0;
    matches.forEach(function (el) {
      if (el.parentNode === stash) return;
      if (!stashedFrom[selector]) {
        stashedFrom[selector] = el.parentNode || document.body;
      }
      // Belt-and-braces inline styles in case some upstream code clones
      // this element back out of the stash and into the page; the styles
      // travel with the element and keep it invisible/non-interactive.
      el.style.setProperty('position', 'absolute', 'important');
      el.style.setProperty('left', '-99999px', 'important');
      el.style.setProperty('top', '-99999px', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
      stash.appendChild(el);
      moved++;
    });
    if (moved > 0) stashedSelectors[selector] = true;
  }

  function restoreFromStash(selector) {
    var stash = document.getElementById('kiban-cluster-stash');
    delete stashedSelectors[selector];
    if (!stash) return;
    var els = stash.querySelectorAll(selector);
    if (!els.length) return;
    var parent = stashedFrom[selector] || document.body;
    els.forEach(function (el) {
      el.style.removeProperty('position');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('pointer-events');
      el.removeAttribute('aria-hidden');
      parent.appendChild(el);
    });
    delete stashedFrom[selector];
  }

  // MutationObserver to catch escapees — when the body gains a new node
  // matching a selector that's currently meant to be in the stash (e.g.
  // Silktide re-instantiating #stcm-icon), drag it back in immediately.
  var bodyObserver = null;
  function ensureBodyObserver() {
    if (bodyObserver || !window.MutationObserver) return;
    bodyObserver = new MutationObserver(function () {
      // stashElement is idempotent: it walks every match and only moves
      // ones that aren't already inside the stash. Cheaper than trying to
      // detect "is there an escapee" first (querySelector returns the
      // already-stashed copy, which masks the new one).
      Object.keys(stashedSelectors).forEach(function (sel) {
        stashElement(sel);
      });
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function ensureCluster(corner, ids) {
    ensureClusterStyles();
    var c = clusters[corner];
    if (!c) {
      c = clusters[corner] = {
        trigger: buildTrigger(corner),
        panel:   buildPanel(corner),
        open:    false,
      };
      document.body.appendChild(c.trigger);
      document.body.appendChild(c.panel);

      c.trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        setClusterOpen(corner, !c.open);
      });
      // Close on outside click / ESC. Listeners live for the page lifetime,
      // which is fine — they're cheap and the cluster persists.
      document.addEventListener('click', function (e) {
        if (!c.open) return;
        if (e.target !== c.trigger && !c.trigger.contains(e.target)
         && !c.panel.contains(e.target)) {
          setClusterOpen(corner, false);
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && c.open) setClusterOpen(corner, false);
      });
    }

    positionCluster(corner, c);
    ensureBodyObserver();

    // Re-render proxy items each pass — cheap, and handles widgets that
    // register or de-register dynamically.
    c.panel.innerHTML = '';
    ids.forEach(function (id, idx) {
      var item = stackItems[id];
      // Move the original element(s) into the off-screen stash so they
      // can't peek through behind the cluster trigger or steal pointer
      // events. stashElement handles duplicate matches (Silktide can
      // recreate its icon) and keeps the body-observer subscription up to
      // date so future re-creations also get hauled back.
      stashElement(item.selector);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kiban-cluster-item kiban-glass';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('data-widget-id', id);
      btn.setAttribute('aria-label',
        (item.cluster && item.cluster.label) || id);
      btn.style.transitionDelay = (idx * 40) + 'ms';
      btn.innerHTML = cloneIconFor(item);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        activateItem(item);
        setClusterOpen(corner, false);
      });
      c.panel.appendChild(btn);
    });
  }

  function destroyCluster(corner) {
    var c = clusters[corner];
    if (!c) return;
    if (c.trigger.parentNode) c.trigger.parentNode.removeChild(c.trigger);
    if (c.panel.parentNode) c.panel.parentNode.removeChild(c.panel);
    delete clusters[corner];
  }

  function arrangeStack() {
    var byCorner = { bl: [], br: [], tl: [], tr: [] };
    Object.keys(stackItems).forEach(function (id) {
      byCorner[stackItems[id].corner].push(id);
    });
    Object.keys(byCorner).forEach(function (corner) {
      byCorner[corner].sort(function (a, b) {
        var ai = STACK_ORDER.indexOf(a), bi = STACK_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    });

    var css = '/* kiban widget stack — autogenerated */\n';

    Object.keys(byCorner).forEach(function (corner) {
      var ids = byCorner[corner];
      var vProp = corner.charAt(0) === 'b' ? 'bottom' : 'top';
      var hProp = corner.charAt(1) === 'l' ? 'left' : 'right';

      // A widget joins the cluster when (a) the admin included it AND
      // (b) it isn't in the kind-exempt list (i18n today). Anything else
      // stays standalone in its corner.
      var includedSet = clusterConfig.includedWidgets || [];
      var clusterables = ids.filter(function (id) {
        return includedSet.indexOf(id) !== -1
            && CLUSTER_KIND_EXEMPT.indexOf(id) === -1;
      });
      var exempt = ids.filter(function (id) {
        return clusterables.indexOf(id) === -1;
      });

      // Reveal rules counter-act the kiban-pre-hide stylesheet — every
      // widget that ends up standalone (or as the sole occupant of its
      // corner) needs visibility:visible so it actually appears. Skipped
      // until arrangeReady() so a fast-registering widget doesn't flash
      // visible and then snap into the cluster when a slow one joins.
      var revealStandalone = arrangeReady()
        ? ' visibility: visible !important; pointer-events: auto !important;'
        : '';

      if (clusterables.length >= CLUSTER_THRESHOLD) {
        // Cluster mode — originals get yanked into the off-screen stash
        // by ensureCluster itself, no per-element hiding rules needed.
        ensureCluster(corner, clusterables);
        // Exempt widgets shift up when the cluster opens so the proxies
        // never overlap them, and shift back down to hug the trigger when
        // it closes (no awkward empty space). Two rules per exempt: a
        // base bottom right above the trigger, and an over-ride keyed to
        // body[data-kiban-cluster-{corner}-open] for the open state.
        var panelHeight = clusterables.length * 44
                        + Math.max(0, clusterables.length - 1) * STACK_GAP;
        var closedBase = STACK_EDGE + 44 + STACK_GAP;
        var openBase = closedBase + panelHeight + STACK_GAP;
        var idx = 0;
        exempt.forEach(function (id) {
          var item = stackItems[id];
          restoreFromStash(item.selector);
          var closedOffset = closedBase + idx * (item.height + STACK_GAP);
          var openOffset   = openBase   + idx * (item.height + STACK_GAP);
          css += item.selector + ' { '
               + vProp + ': ' + closedOffset + 'px !important; '
               + hProp + ': ' + STACK_EDGE + 'px !important;'
               + ' transition: ' + vProp + ' 0.25s cubic-bezier(0.2, 0.9, 0.2, 1);'
               + revealStandalone + ' }\n';
          css += 'body[data-kiban-cluster-' + corner + '-open="true"] '
               + item.selector + ' { '
               + vProp + ': ' + openOffset + 'px !important; }\n';
          idx++;
        });
      } else {
        // No cluster — restore any previously-stashed originals and stack
        // them individually.
        destroyCluster(corner);
        var offset = STACK_EDGE;
        ids.forEach(function (id) {
          var item = stackItems[id];
          restoreFromStash(item.selector);
          css += item.selector + ' { ' + vProp + ': ' + offset + 'px !important; '
               + hProp + ': ' + STACK_EDGE + 'px !important;'
               + revealStandalone + ' }\n';
          offset += item.height + STACK_GAP;
        });
      }
    });

    var style = document.getElementById('kiban-widget-stack');
    if (!style) {
      style = document.createElement('style');
      style.id = 'kiban-widget-stack';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  // Auto-discover non-KIBAN floating elements that opt in via attributes:
  //   <button id="back-to-top" data-kiban-stack-corner="bottomRight"
  //           data-kiban-stack-height="48">↑</button>
  // The loader treats them like any other widget for stacking purposes.
  // Height falls back to the element's measured offsetHeight if the
  // attribute is omitted.
  function autoRegisterMarkedElements() {
    if (!document.body) return;
    var nodes = document.querySelectorAll('[data-kiban-stack-corner]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var id = el.getAttribute('data-kiban-stack-id') || el.id || ('site-' + i);
      var selector = el.id ? '#' + el.id : '[data-kiban-stack-id="' + id + '"]';
      var height = parseInt(el.getAttribute('data-kiban-stack-height'), 10)
                   || el.offsetHeight || 44;
      window.KibanWidgets.register(id, {
        selector: selector,
        corner: el.getAttribute('data-kiban-stack-corner'),
        height: height,
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────
  window.KibanWidgets = {
    getBaseUrl: function () { return BASE_URL; },
    getApiKey: function () { return API_KEY; },
    register: function (id, opts) {
      if (!id || !opts || !opts.selector) return;
      stackItems[id] = {
        selector: opts.selector,
        corner: normalizeCorner(opts.corner),
        height: opts.height || 44,
        cluster: opts.cluster || null,
      };
      // Slightly longer debounce than before (200ms) so all four widgets'
      // async config fetches have time to settle into a single layout pass —
      // otherwise the first one to register flashes individually before the
      // cluster forms.
      clearTimeout(stackTimer);
      stackTimer = setTimeout(arrangeStack, 200);
    },
    unregister: function (id) {
      delete stackItems[id];
      clearTimeout(stackTimer);
      stackTimer = setTimeout(arrangeStack, 80);
    },
    rearrange: function () { arrangeStack(); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRegisterMarkedElements);
  } else {
    autoRegisterMarkedElements();
  }
})();
