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

  // ── Inject widget script ────────────────────────────────────────────
  function injectWidget(widgetPath) {
    var script = document.createElement('script');
    script.src = BASE_URL + widgetPath;
    script.setAttribute('data-api-key', API_KEY);
    if (TENANT_ID) script.setAttribute('data-tenant', TENANT_ID);
    script.async = true;
    document.head.appendChild(script);
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    fetchEnabledWidgets(function (err, res) {
      if (err || !res || !res.data) return;

      var enabledAddons = res.data; // array of addon_id strings

      enabledAddons.forEach(function (addonId) {
        var widgetPath = WIDGET_MAP[addonId];
        if (widgetPath) {
          injectWidget(widgetPath);
        }
      });
    });
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
  // Widgets that don't fit the simple "icon → opens panel" pattern stay
  // standalone (i18n's pill expands in-place; building a sub-menu for it
  // inside the cluster doubles the language-switching logic).
  var CLUSTER_EXEMPT = ['i18n'];

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
      '.kiban-glass {',
      '  background: rgba(255, 255, 255, 0.14);',
      '  -webkit-backdrop-filter: blur(24px) saturate(1.6);',
      '  backdrop-filter: blur(24px) saturate(1.6);',
      '  border: 1px solid rgba(255, 255, 255, 0.22);',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);',
      '}',
      '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {',
      '  .kiban-glass { background: rgba(20, 20, 20, 0.85); }',
      '}',
      ':root:not([data-kiban-no-tint]) .kiban-glass {',
      '  background: color-mix(in srgb, var(--kiban-widget-tint, transparent) 14%, rgba(255, 255, 255, 0.14));',
      '}',
      '.kiban-cluster-trigger, .kiban-cluster-item {',
      '  position: fixed;',
      '  width: 44px; height: 44px;',
      '  border-radius: 50%;',
      '  display: flex; align-items: center; justify-content: center;',
      '  cursor: pointer;',
      '  color: #fff;',
      '  padding: 0;',
      '  transition: transform 0.18s ease, opacity 0.2s ease;',
      '}',
      '.kiban-cluster-trigger { z-index: 2147483600; }',
      '.kiban-cluster-trigger:hover { transform: scale(1.06); }',
      '.kiban-cluster-trigger:active { transform: scale(0.94); }',
      '.kiban-cluster-trigger[aria-expanded="true"] { transform: rotate(180deg); }',
      '.kiban-cluster-trigger svg, .kiban-cluster-item svg, .kiban-cluster-item img {',
      '  width: 22px; height: 22px;',
      '  pointer-events: none;',
      '  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35));',
      '}',
      '.kiban-cluster-item svg, .kiban-cluster-item img { width: 22px; height: 22px; }',
      '.kiban-cluster-item svg path, .kiban-cluster-item svg circle, .kiban-cluster-item svg line {',
      '  fill: currentColor; stroke: currentColor;',
      '}',
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

    // Re-render proxy items each pass — cheap, and handles widgets that
    // register or de-register dynamically.
    c.panel.innerHTML = '';
    ids.forEach(function (id, idx) {
      var item = stackItems[id];
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

      var clusterables = ids.filter(function (id) {
        return CLUSTER_EXEMPT.indexOf(id) === -1;
      });
      var exempt = ids.filter(function (id) {
        return CLUSTER_EXEMPT.indexOf(id) !== -1;
      });

      if (clusterables.length >= CLUSTER_THRESHOLD) {
        ensureCluster(corner, clusterables);
        clusterables.forEach(function (id) {
          css += stackItems[id].selector + ' { display: none !important; }\n';
        });
        // Stack exempt widgets above the cluster trigger so the trigger
        // always sits closest to the corner.
        var offset = STACK_EDGE + 44 + STACK_GAP;
        exempt.forEach(function (id) {
          var item = stackItems[id];
          css += item.selector + ' { ' + vProp + ': ' + offset + 'px !important; '
               + hProp + ': ' + STACK_EDGE + 'px !important; }\n';
          offset += item.height + STACK_GAP;
        });
      } else {
        // No cluster — stack everything individually (≤1 clusterable).
        destroyCluster(corner);
        var offset = STACK_EDGE;
        ids.forEach(function (id) {
          var item = stackItems[id];
          css += item.selector + ' { ' + vProp + ': ' + offset + 'px !important; '
               + hProp + ': ' + STACK_EDGE + 'px !important; }\n';
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
