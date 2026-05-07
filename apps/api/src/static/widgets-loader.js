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

  // ── Public API ──────────────────────────────────────────────────────
  window.KibanWidgets = {
    getBaseUrl: function () { return BASE_URL; },
    getApiKey: function () { return API_KEY; },
  };
})();
