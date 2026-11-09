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


  // ── Marketing tags: Meta Pixel, Google (Consent Mode v2), conversions ──
  // Makes the Pixel, Google Analytics / Ads / Tag Manager and the Meta
  // Conversions API work on every site that loads this script, without site
  // code changes. GDPR: tags follow the visitor's choice in the Kiban cookie
  // banner (KibanCookieNotice only reports consent once it has validated the
  // stored choice: expiry, banner version), and conversions carry the
  // consent flag the server checks before sending anything to Meta.
  var pixel = { id: null, loadedByKiban: false };
  var google = { ga: '', ads: '', gtm: '', mode: 'basic', ready: false, own: false,
    gtagLoaded: false, gaOn: false, adsOn: false, gtmOn: false, lastState: '' };

  function hasConsent(category) {
    var cn = window.KibanCookieNotice;
    return !!(cn && typeof cn.hasConsentFor === 'function' && cn.hasConsentFor(category));
  }
  function hasMarketingConsent() { return hasConsent('marketing'); }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  }

  function newEventId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function buildTracking() {
    return {
      marketing_consent: hasMarketingConsent(),
      event_id: newEventId(),
      fbp: readCookie('_fbp'),
      fbc: readCookie('_fbc') || fbcFromUrl(),
      source_url: location.href.slice(0, 500),
    };
  }

  // A click from a Meta ad lands with ?fbclid=…; fbc must then be sent even
  // before the Pixel had a chance to write the _fbc cookie.
  function fbcFromUrl() {
    try {
      var id = new URL(location.href).searchParams.get('fbclid');
      return id ? 'fb.1.' + Date.now() + '.' + id : undefined;
    } catch (_) { return undefined; }
  }

  function injectScript(src) {
    var t = document.createElement('script');
    t.async = true;
    t.src = src;
    (document.head || document.documentElement).appendChild(t);
  }

  // ── Meta Pixel ──
  function loadPixel() {
    if (!pixel.id || !hasMarketingConsent()) return;
    if (window.fbq) return; // the site installs its own Pixel — never double-load
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    pixel.loadedByKiban = true;
    window.fbq('init', pixel.id);
    window.fbq('track', 'PageView');
    // Single-page sites: count route changes as page views too
    var push = history.pushState;
    history.pushState = function () {
      var r = push.apply(this, arguments);
      try { window.fbq('track', 'PageView'); } catch (_) {}
      return r;
    };
    window.addEventListener('popstate', function () { try { window.fbq('track', 'PageView'); } catch (_) {} });
  }

  // ── Google: GA4 / Ads / Tag Manager with Consent Mode v2 ──
  function googleConsentState() {
    var a = hasConsent('analytics') ? 'granted' : 'denied';
    var m = hasMarketingConsent() ? 'granted' : 'denied';
    return { analytics_storage: a, ad_storage: m, ad_user_data: m, ad_personalization: m };
  }

  function initGoogle(a) {
    var pick = function (v, re) { v = String(v || '').trim(); return re.test(v) ? v : ''; };
    google.ga = pick(a.google_analytics, /^G-[A-Z0-9]{4,}$/i);
    google.ads = pick(a.google_ads, /^AW-\d{5,}$/i);
    google.gtm = pick(a.google_tag_manager, /^GTM-[A-Z0-9]{4,}$/i);
    google.mode = a.google_consent_mode === 'advanced' ? 'advanced' : 'basic';
    if (a.google_autoload === false || !(google.ga || google.ads || google.gtm)) return;
    // The site already runs Google tags itself: don't load them twice, only
    // keep its Consent Mode in sync with the banner.
    google.own = typeof window.gtag === 'function'
      || !!document.querySelector('script[src*="googletagmanager.com/gtag/js"],script[src*="googletagmanager.com/gtm.js"]');
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') window.gtag = function () { window.dataLayer.push(arguments); };
    if (!google.own) {
      window.gtag('consent', 'default', {
        ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
        analytics_storage: 'denied', wait_for_update: 500,
      });
    }
    google.ready = true;
    syncGoogle();
  }

  function syncGoogle() {
    if (!google.ready) return;
    var s = googleConsentState();
    var key = JSON.stringify(s);
    if (key !== google.lastState) {
      google.lastState = key;
      window.gtag('consent', 'update', s);
    }
    if (google.own) return;
    // Basic mode (default): each tag loads only after the matching consent.
    // Advanced: tags load at once and send cookieless pings until consent.
    var adv = google.mode === 'advanced';
    var wantGa = !!google.ga && (adv || s.analytics_storage === 'granted');
    var wantAds = !!google.ads && (adv || s.ad_storage === 'granted');
    var wantGtm = !!google.gtm && (adv || s.analytics_storage === 'granted' || s.ad_storage === 'granted');
    if ((wantGa || wantAds) && !google.gtagLoaded) {
      google.gtagLoaded = true;
      window.gtag('js', new Date());
      injectScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(wantGa ? google.ga : google.ads));
    }
    if (wantGa && !google.gaOn) { google.gaOn = true; window.gtag('config', google.ga); }
    if (wantAds && !google.adsOn) { google.adsOn = true; window.gtag('config', google.ads); }
    if (wantGtm && !google.gtmOn) {
      google.gtmOn = true;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      injectScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(google.gtm));
    }
  }

  // ── Conversions (browser side) ──
  var CONVERSIONS = {
    lead:     { fb: 'Lead',                 ga: 'generate_lead' },
    signup:   { fb: 'CompleteRegistration', ga: 'sign_up' },
    checkout: { fb: 'InitiateCheckout',     ga: 'begin_checkout' },
    contact:  { fb: 'Contact',              ga: 'contact' },
  };

  function fireConversion(kind, eventId, params) {
    var c = CONVERSIONS[kind];
    if (!c) return;
    params = params || {};
    // Meta: only with marketing consent; same event_id as the server event
    try { if (hasMarketingConsent() && typeof window.fbq === 'function') window.fbq('track', c.fb, params, { eventID: eventId }); } catch (_) {}
    // Google: Consent Mode decides what the tags may store/send
    try {
      if ((google.gaOn || google.adsOn || google.own) && typeof window.gtag === 'function') window.gtag('event', c.ga, params);
    } catch (_) {}
    // Tag Manager / custom setups
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        var dl = { event: 'kiban_' + kind, kiban_event_id: eventId };
        for (var k in params) dl['kiban_' + k] = params[k];
        window.dataLayer.push(dl);
      }
    } catch (_) {}
  }

  // WhatsApp / phone / email clicks → Contact (browser + Conversions API)
  var lastContactAt = 0;
  function trackContact(method) {
    if (Date.now() - lastContactAt < 1500) return; // one click, one event
    lastContactAt = Date.now();
    var t = buildTracking();
    fireConversion('contact', t.event_id, { method: method });
    if (!t.marketing_consent) return; // the server would not send it anyway
    try {
      var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY };
      if (TENANT_ID) headers['X-Tenant'] = TENANT_ID;
      fetch(BASE_URL + '/api/v1/marketing/track', {
        method: 'POST', headers: headers, keepalive: true,
        body: JSON.stringify({ event: 'Contact', method: method, tracking: t }),
      }).catch(function () {});
    } catch (_) {}
  }

  function contactMethod(href) {
    if (/^tel:/i.test(href)) return 'phone';
    if (/^mailto:/i.test(href)) return 'email';
    if (/^(https?:\/\/)?(wa\.me\/|api\.whatsapp\.com\/|web\.whatsapp\.com\/|chat\.whatsapp\.com\/)|^whatsapp:/i.test(href)) return 'whatsapp';
    return '';
  }

  function installContactTracking() {
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        var m = contactMethod(a.getAttribute('href') || '');
        if (m) trackContact(m);
      } catch (_) {}
    }, true);
    // The Kiban WhatsApp widget opens the chat with window.open, not a link
    window.addEventListener('kiban-contact', function (e) {
      trackContact((e && e.detail && e.detail.method) || 'whatsapp');
    });
  }

  function fetchSeoConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/seo');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      try {
        var a = (JSON.parse(xhr.responseText).data || {}).analytics || {};
        callback(a);
      } catch (_) {}
    };
    xhr.send();
  }

  function initMarketing() {
    fetchSeoConfig(function (a) {
      var id = String(a.facebook_pixel || '').replace(/\D/g, '');
      if (id && a.facebook_pixel_autoload !== false) pixel.id = id;
      initGoogle(a);
      var onConsent = function () { loadPixel(); syncGoogle(); };
      onConsent();
      window.addEventListener('kiban-consent-change', onConsent);
      window.addEventListener('kiban-consent-ready', onConsent);
    });
  }

  // Conversions sent by the site to this CMS get `tracking` added
  // automatically (consent, event_id, _fbp/_fbc, page) unless the site
  // already sends it. On success, the matching browser events fire (Meta
  // with the same event_id, so Meta deduplicates it against the server event).
  var TRACKED_PATHS = [
    { re: /\/api\/v1\/forms\/submit(?:\?|$)/, kind: 'lead' },
    { re: /\/api\/v1\/newsletter\/subscribe(?:\?|$)/, kind: 'signup' },
    { re: /\/api\/v1\/checkout\/create-session(?:\?|$)/, kind: 'checkout' },
    { re: /\/api\/v1\/bookings(?:\/v2)?\/checkout(?:\?|$)/, kind: 'checkout' },
    { re: /\/api\/v1\/payments\/create-session(?:\?|$)/, kind: 'checkout' },
  ];

  function installConversionTracking() {
    if (!window.fetch || window.fetch.__kibanTracking) return;
    var originalFetch = window.fetch;
    var wrapped = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        var match = null;
        if (method === 'POST' && url.indexOf(BASE_URL + '/api/v1/') === 0) {
          for (var i = 0; i < TRACKED_PATHS.length; i++) {
            if (TRACKED_PATHS[i].re.test(url)) { match = TRACKED_PATHS[i]; break; }
          }
        }
        if (match && init && typeof init.body === 'string') {
          var body = JSON.parse(init.body);
          // Sites that send their own `tracking` also fire their own events
          if (body && typeof body === 'object' && !Array.isArray(body) && !body.tracking) {
            var t = buildTracking();
            body.tracking = t;
            var newInit = {};
            for (var k in init) newInit[k] = init[k];
            newInit.body = JSON.stringify(body);
            return originalFetch.call(this, input, newInit).then(function (res) {
              try { if (res && res.ok) fireConversion(match.kind, t.event_id); } catch (_) {}
              return res;
            });
          }
        }
      } catch (_) { /* never break the site's request */ }
      return originalFetch.apply(this, arguments);
    };
    wrapped.__kibanTracking = true;
    window.fetch = wrapped;
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    bootTime = Date.now();
    initMarketing();
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
    // 'corner' = round trigger in the widgets' corner (default)
    // 'edge'   = discreet tab at the vertical middle of the left/right edge
    layout: 'corner',
    edgeSide: 'right',
  };
  function applyClusterConfig(cfg) {
    if (cfg && typeof cfg === 'object') {
      if (typeof cfg.accentColor !== 'undefined') clusterConfig.accentColor = cfg.accentColor;
      if (Array.isArray(cfg.includedWidgets))    clusterConfig.includedWidgets = cfg.includedWidgets;
      if (cfg.layout === 'edge' || cfg.layout === 'corner') clusterConfig.layout = cfg.layout;
      if (cfg.edgeSide === 'left' || cfg.edgeSide === 'right') clusterConfig.edgeSide = cfg.edgeSide;
    }
    var root = document.documentElement;
    if (clusterConfig.accentColor) {
      root.style.setProperty('--kiban-widget-tint', clusterConfig.accentColor);
      root.setAttribute('data-kiban-tint', '');
    } else {
      root.style.removeProperty('--kiban-widget-tint');
      root.removeAttribute('data-kiban-tint');
    }
    // Re-arrange in case the inclusion list changed widgets that were
    // already registered when the config arrived.
    if (Object.keys(stackItems).length > 0) {
      clearTimeout(stackTimer);
      stackTimer = setTimeout(arrangeStack, 50);
    }
  }

  installConversionTracking();
  installContactTracking();

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
  // i18n joins the cluster when its public API is available: the menu then
  // lists the languages itself (it can't just "click" the in-place pill).
  function i18nApi() {
    var api = window.KibanI18n;
    if (!api || typeof api.getLanguages !== 'function' || typeof api.setLanguage !== 'function') return null;
    var langs = api.getLanguages() || [];
    return langs.length > 1 ? api : null;
  }
  function isClusterExempt(id) {
    if (id === 'i18n') return !i18nApi();
    return CLUSTER_KIND_EXEMPT.indexOf(id) !== -1;
  }
  // Re-render menus when the language changes (badge shows the current one)
  window.addEventListener('kiban-lang-change', function () {
    clearTimeout(stackTimer);
    stackTimer = setTimeout(function () { arrangeStack(); }, 60);
  });

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
      ':root[data-kiban-tint]:not([data-kiban-no-tint]) .kiban-glass {',
      '  background: color-mix(in srgb, var(--kiban-widget-tint, transparent) 22%, rgba(20, 20, 22, 0.55));',
      '}',
      // Menus with TEXT (edge menu, language tray) need a denser glass: at
      // 55% over a white page the white labels drop below WCAG AA contrast.
      // 86% keeps the glass look while staying readable on any background.
      '.kiban-edge-panel.kiban-glass, .kiban-lang-tray.kiban-glass { background: rgba(20, 20, 22, 0.86); }',
      ':root[data-kiban-tint]:not([data-kiban-no-tint]) .kiban-edge-panel.kiban-glass, :root[data-kiban-tint]:not([data-kiban-no-tint]) .kiban-lang-tray.kiban-glass {',
      '  background: color-mix(in srgb, var(--kiban-widget-tint, transparent) 22%, rgba(20, 20, 22, 0.86));',
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
      // ── Edge tab layout ────────────────────────────────────────────
      // A slim, half-hidden tab at the vertical middle of the page edge.
      // Visually ~10px wide; the ::before pseudo-element widens the hit
      // area to 28px (WCAG 2.2 target size ≥ 24px) without showing it.
      '.kiban-edge-tab {',
      '  position: fixed; top: 50%; z-index: 2147483600;',
      '  width: 10px; height: 64px; padding: 0; margin: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  color: #fff; cursor: pointer; opacity: 0.55;',
      '  transform: translateY(-50%);',
      '  transition: width 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.2s ease;',
      '}',
      '.kiban-edge-tab[data-side="right"] { right: 0; border-right: 0; border-radius: 12px 0 0 12px; }',
      '.kiban-edge-tab[data-side="left"]  { left: 0;  border-left: 0;  border-radius: 0 12px 12px 0; }',
      '.kiban-edge-tab::before { content: ""; position: absolute; top: -6px; bottom: -6px; width: 28px; }',
      '.kiban-edge-tab[data-side="right"]::before { right: 0; }',
      '.kiban-edge-tab[data-side="left"]::before  { left: 0; }',
      '.kiban-edge-tab:hover, .kiban-edge-tab:focus-visible, .kiban-edge-tab[aria-expanded="true"] { width: 30px; opacity: 1; }',
      '.kiban-edge-tab:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }',
      // Collapsed: a tiny grip. Hover/open: the preferences glyph.
      '.kiban-edge-tab .kiban-edge-grip { width: 2px; height: 18px; border-radius: 1px; background: currentColor; opacity: 0.85; }',
      '.kiban-edge-tab .kiban-edge-icon { display: none; }',
      '.kiban-edge-tab:hover .kiban-edge-grip, .kiban-edge-tab:focus-visible .kiban-edge-grip, .kiban-edge-tab[aria-expanded="true"] .kiban-edge-grip { display: none; }',
      '.kiban-edge-tab:hover .kiban-edge-icon, .kiban-edge-tab:focus-visible .kiban-edge-icon, .kiban-edge-tab[aria-expanded="true"] .kiban-edge-icon { display: flex; }',
      '.kiban-edge-icon svg { width: 16px; height: 16px; pointer-events: none; }',
      '.kiban-edge-panel {',
      '  position: fixed; top: 50%; z-index: 2147483599;',
      '  display: flex; flex-direction: column; gap: 2px;',
      '  min-width: 184px; padding: 6px; border-radius: 16px;',
      '  opacity: 0; pointer-events: none;',
      '  transition: opacity 0.18s ease, transform 0.25s cubic-bezier(0.2, 0.9, 0.2, 1);',
      '}',
      '.kiban-edge-panel[data-side="right"] { right: 40px; transform: translate(10px, -50%); }',
      '.kiban-edge-panel[data-side="left"]  { left: 40px;  transform: translate(-10px, -50%); }',
      '.kiban-edge-panel[data-open="true"] { opacity: 1; pointer-events: auto; transform: translate(0, -50%); }',
      '.kiban-edge-item {',
      '  display: flex; align-items: center; gap: 12px; width: 100%;',
      '  padding: 10px 12px; border: 0; border-radius: 11px;',
      '  background: transparent; color: #fff; cursor: pointer; text-align: left;',
      '  font: 500 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      '.kiban-edge-item:hover, .kiban-edge-item:focus-visible { background: rgba(255, 255, 255, 0.12); outline: none; }',
      '.kiban-edge-item svg, .kiban-edge-item img { width: 20px; height: 20px; flex: 0 0 20px; pointer-events: none; }',
      // Language: badge with the current code, submenu (edge) / tray (corner)
      '.kiban-edge-badge { margin-left: auto; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,0.16); font: 600 11px/1.4 -apple-system, sans-serif; letter-spacing: .04em; text-transform: uppercase; }',
      '.kiban-edge-chevron { width: 14px; height: 14px; flex: 0 0 14px; opacity: .8; transition: transform .2s ease; }',
      '.kiban-edge-item[aria-expanded="true"] .kiban-edge-chevron { transform: rotate(180deg); }',
      '.kiban-edge-sub { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 4px 32px; }',
      '.kiban-edge-sub[hidden] { display: none; }',
      '.kiban-edge-subitem { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; color: rgba(255,255,255,.85); cursor: pointer; text-align: left; font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
      '.kiban-edge-subitem:hover, .kiban-edge-subitem:focus-visible { background: rgba(255,255,255,0.12); outline: none; color: #fff; }',
      '.kiban-edge-subitem[aria-checked="true"] { color: #fff; font-weight: 600; }',
      '.kiban-edge-subitem .kiban-edge-check { width: 14px; flex: 0 0 14px; text-align: center; }',
      '.kiban-cluster-item.kiban-lang-item { position: relative; font: 600 11px/1 -apple-system, sans-serif; letter-spacing: .06em; text-transform: uppercase; }',
      '.kiban-lang-tray { position: absolute; top: 50%; transform: translateY(-50%); display: none; gap: 4px; padding: 4px; border-radius: 999px; white-space: nowrap; }',
      '.kiban-lang-tray[data-open="true"] { display: flex; }',
      '.kiban-lang-tray[data-side="left"]  { left: calc(100% + 8px); }',
      '.kiban-lang-tray[data-side="right"] { right: calc(100% + 8px); }',
      '.kiban-lang-code { padding: 8px 12px; border: 0; border-radius: 999px; background: transparent; color: rgba(255,255,255,.7); cursor: pointer; font: 600 11px/1 -apple-system, sans-serif; letter-spacing: .06em; text-transform: uppercase; }',
      '.kiban-lang-code:hover, .kiban-lang-code:focus-visible { color: #fff; background: rgba(255,255,255,.12); outline: none; }',
      '.kiban-lang-code[aria-checked="true"] { color: #fff; background: rgba(255,255,255,.2); }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .kiban-cluster-trigger, .kiban-cluster-item, .kiban-edge-tab, .kiban-edge-panel, .kiban-edge-chevron { transition: none; }',
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

  var GLOBE_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/></svg>';

  function cloneIconFor(item, id) {
    if (item.cluster && item.cluster.icon) return item.cluster.icon;
    if (id === 'i18n') return GLOBE_ICON_SVG; // the language pill has no icon of its own
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

    // Re-render proxy items only when the set (or current language) changed,
    // so an open panel/language tray isn't reset by a background re-arrange.
    var api18c = i18nApi();
    var sigC = ids.join(',') + '|' + (api18c ? api18c.getLanguage() : '');
    if (c.signature === sigC) {
      ids.forEach(function (id) { stashElement(stackItems[id].selector); });
      return;
    }
    c.signature = sigC;
    c.panel.innerHTML = '';
    ids.forEach(function (id, idx) {
      var item = stackItems[id];
      if (id === 'i18n' && i18nApi()) {
        stashElement(item.selector);
        c.panel.appendChild(buildCornerLanguageItem(corner, idx));
        return;
      }
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
      btn.innerHTML = cloneIconFor(item, id);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        activateItem(item);
        setClusterOpen(corner, false);
      });
      c.panel.appendChild(btn);
    });
  }

  function buildCornerLanguageItem(corner, idx) {
    var api = i18nApi();
    var current = api.getLanguage();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kiban-cluster-item kiban-glass kiban-lang-item';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-widget-id', 'i18n');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', EDGE_LABELS[edgeLang()].i18n + ': ' + String(current).toUpperCase());
    btn.style.transitionDelay = (idx * 40) + 'ms';
    btn.appendChild(document.createTextNode(String(current).toUpperCase()));

    var tray = document.createElement('div');
    tray.className = 'kiban-lang-tray kiban-glass';
    tray.setAttribute('role', 'group');
    tray.setAttribute('data-side', corner.charAt(1) === 'l' ? 'left' : 'right');
    api.getLanguages().forEach(function (lang) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kiban-lang-code';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', lang.code === current ? 'true' : 'false');
      b.setAttribute('aria-label', lang.name || lang.code);
      b.textContent = lang.code;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        api.setLanguage(lang.code);
        setClusterOpen(corner, false);
      });
      tray.appendChild(b);
    });
    btn.appendChild(tray);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target !== btn) return; // clicks on the codes are handled above
      var open = tray.getAttribute('data-open') !== 'true';
      tray.setAttribute('data-open', open ? 'true' : 'false');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return btn;
  }

  function destroyCluster(corner) {
    var c = clusters[corner];
    if (!c) return;
    if (c.trigger.parentNode) c.trigger.parentNode.removeChild(c.trigger);
    if (c.panel.parentNode) c.panel.parentNode.removeChild(c.panel);
    delete clusters[corner];
  }

  // ── Edge tab cluster ───────────────────────────────────────────────
  // One discreet tab for ALL clusterable widgets (whatever their corner),
  // opening a small labelled menu. Keyboard: Enter/Space opens, arrows move,
  // Esc closes and returns focus to the tab.
  var EDGE_LABELS = {
    pt: { tab: 'Preferências do site', accessibility: 'Acessibilidade', 'cookie-notice': 'Cookies', 'whatsapp-widget': 'WhatsApp', i18n: 'Idioma' },
    en: { tab: 'Site preferences', accessibility: 'Accessibility', 'cookie-notice': 'Cookies', 'whatsapp-widget': 'WhatsApp', i18n: 'Language' },
  };
  function edgeLang() {
    var l = (document.documentElement.getAttribute('lang') || navigator.language || 'pt').toLowerCase();
    return l.indexOf('pt') === 0 ? 'pt' : 'en';
  }
  function edgeLabel(id, item) {
    var t = EDGE_LABELS[edgeLang()];
    return t[id] || (item && item.cluster && item.cluster.label) || id;
  }

  var edge = null; // { tab, panel, open, side }

  function setEdgeOpen(open, focusTarget) {
    if (!edge) return;
    edge.open = open;
    edge.panel.setAttribute('data-open', open ? 'true' : 'false');
    edge.tab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var first = edge.panel.querySelector('.kiban-edge-item');
      if (first && focusTarget !== 'none') setTimeout(function () { try { first.focus(); } catch (_) {} }, 30);
    } else if (focusTarget === 'tab') {
      try { edge.tab.focus(); } catch (_) {}
    }
  }

  function ensureEdgeCluster(ids) {
    ensureClusterStyles();
    var side = clusterConfig.edgeSide === 'left' ? 'left' : 'right';
    if (!edge) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.id = 'kiban-edge-tab';
      tab.className = 'kiban-edge-tab kiban-glass';
      tab.setAttribute('aria-expanded', 'false');
      tab.setAttribute('aria-controls', 'kiban-edge-panel');
      tab.setAttribute('aria-haspopup', 'menu');
      tab.innerHTML = '<span class="kiban-edge-grip" aria-hidden="true"></span>'
                    + '<span class="kiban-edge-icon" aria-hidden="true">' + TRIGGER_ICON_SVG + '</span>';
      var panel = document.createElement('div');
      panel.id = 'kiban-edge-panel';
      panel.className = 'kiban-edge-panel kiban-glass';
      panel.setAttribute('role', 'menu');
      panel.setAttribute('data-open', 'false');
      document.body.appendChild(tab);
      document.body.appendChild(panel);
      edge = { tab: tab, panel: panel, open: false, side: side };

      tab.addEventListener('click', function (e) {
        e.stopPropagation();
        setEdgeOpen(!edge.open);
      });
      document.addEventListener('click', function (e) {
        if (!edge || !edge.open) return;
        if (!edge.tab.contains(e.target) && !edge.panel.contains(e.target)) setEdgeOpen(false, 'none');
      });
      document.addEventListener('keydown', function (e) {
        if (!edge || !edge.open) return;
        if (e.key === 'Escape') { setEdgeOpen(false, 'tab'); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          var items = Array.prototype.slice.call(edge.panel.querySelectorAll('.kiban-edge-item, .kiban-edge-sub:not([hidden]) .kiban-edge-subitem'));
          if (!items.length) return;
          var i = items.indexOf(document.activeElement);
          var next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          items[next].focus();
          e.preventDefault();
        }
      });
    }
    edge.side = side;
    edge.tab.setAttribute('data-side', side);
    edge.panel.setAttribute('data-side', side);
    edge.tab.setAttribute('aria-label', EDGE_LABELS[edgeLang()].tab);
    edge.tab.title = EDGE_LABELS[edgeLang()].tab;
    ensureBodyObserver();

    // Re-arranges run several times after load (late widgets) and on every
    // registration: rebuilding the menu each time collapsed the language
    // list and dropped focus while the visitor was using it. Only rebuild
    // when what the menu shows actually changed.
    var api18 = i18nApi();
    var signature = ids.join(',') + '|' + edgeLang() + '|' + (api18 ? api18.getLanguage() : '');
    ids.forEach(function (id) { stashElement(stackItems[id].selector); });
    if (edge.signature === signature) return;
    edge.signature = signature;

    edge.panel.innerHTML = '';
    ids.forEach(function (id) {
      var item = stackItems[id];
      if (id === 'i18n' && i18nApi()) {
        edge.panel.appendChild(buildEdgeLanguageGroup(item));
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kiban-edge-item';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('data-widget-id', id);
      var label = edgeLabel(id, item);
      btn.innerHTML = cloneIconFor(item, id) + '<span></span>';
      btn.lastChild.textContent = label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        setEdgeOpen(false, 'none');
        activateItem(item);
      });
      edge.panel.appendChild(btn);
    });
  }

  var CHEVRON_SVG = '<svg class="kiban-edge-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  function buildEdgeLanguageGroup(item) {
    var api = i18nApi();
    var current = api.getLanguage();
    var group = document.createElement('div');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kiban-edge-item';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-widget-id', 'i18n');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'kiban-edge-langs');
    btn.innerHTML = cloneIconFor(item, 'i18n') + '<span></span><span class="kiban-edge-badge"></span>' + CHEVRON_SVG;
    btn.children[1].textContent = edgeLabel('i18n', item);
    btn.querySelector('.kiban-edge-badge').textContent = String(current);

    var sub = document.createElement('div');
    sub.id = 'kiban-edge-langs';
    sub.className = 'kiban-edge-sub';
    sub.setAttribute('role', 'group');
    sub.hidden = true;
    api.getLanguages().forEach(function (lang) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kiban-edge-subitem';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', lang.code === current ? 'true' : 'false');
      b.innerHTML = '<span class="kiban-edge-check" aria-hidden="true"></span><span></span>';
      b.firstChild.textContent = lang.code === current ? '✓' : '';
      b.lastChild.textContent = lang.name || String(lang.code).toUpperCase();
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        api.setLanguage(lang.code);
        setEdgeOpen(false, 'none');
      });
      sub.appendChild(b);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = sub.hidden;
      sub.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var checked = sub.querySelector('[aria-checked="true"]') || sub.firstChild;
        if (checked) setTimeout(function () { try { checked.focus(); } catch (_) {} }, 20);
      }
    });
    group.appendChild(btn);
    group.appendChild(sub);
    return group;
  }

  function destroyEdgeCluster() {
    if (!edge) return;
    if (edge.tab.parentNode) edge.tab.parentNode.removeChild(edge.tab);
    if (edge.panel.parentNode) edge.panel.parentNode.removeChild(edge.panel);
    edge = null;
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

    if (clusterConfig.layout === 'edge') {
      // All included widgets go into the edge tab (one is enough: the point
      // is to keep the page clean). Exempt/not-included ones stay in their
      // corners, stacked individually.
      var includedEdge = clusterConfig.includedWidgets || [];
      var edgeIds = [];
      Object.keys(byCorner).forEach(function (corner) {
        byCorner[corner] = byCorner[corner].filter(function (id) {
          var inEdge = includedEdge.indexOf(id) !== -1 && !isClusterExempt(id);
          if (inEdge) edgeIds.push(id);
          return !inEdge;
        });
        destroyCluster(corner);
      });
      edgeIds.sort(function (a, b) {
        var ai = STACK_ORDER.indexOf(a), bi = STACK_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      if (edgeIds.length) ensureEdgeCluster(edgeIds); else destroyEdgeCluster();

      var revealEdge = arrangeReady()
        ? ' visibility: visible !important; pointer-events: auto !important;'
        : '';
      Object.keys(byCorner).forEach(function (corner) {
        var vP = corner.charAt(0) === 'b' ? 'bottom' : 'top';
        var hP = corner.charAt(1) === 'l' ? 'left' : 'right';
        var off = STACK_EDGE;
        byCorner[corner].forEach(function (id) {
          var it = stackItems[id];
          restoreFromStash(it.selector);
          css += it.selector + ' { ' + vP + ': ' + off + 'px !important; '
               + hP + ': ' + STACK_EDGE + 'px !important;' + revealEdge + ' }\n';
          off += it.height + STACK_GAP;
        });
      });
      writeStackCss(css);
      return;
    }
    destroyEdgeCluster();

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
            && !isClusterExempt(id);
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

    writeStackCss(css);
  }

  function writeStackCss(css) {
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
