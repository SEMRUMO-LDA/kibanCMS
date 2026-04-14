/**
 * kibanCMS Cookie Notice Widget
 *
 * GDPR-compliant cookie consent banner.
 * Reads configuration from the CMS and renders a customisable banner.
 *
 * Embed: <script src="https://your-cms.com/api/v1/cookie-notice/widget.js" data-api-key="YOUR_KEY"></script>
 */
(function () {
  'use strict';

  // ── Config from script tag ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var BASE_URL = scriptTag.src.replace('/api/v1/cookie-notice/widget.js', '');
  var CONSENT_KEY = 'kiban_cookie_consent';
  var VISITOR_KEY = 'kiban_visitor_id';

  // ── Check if already consented ──
  function getConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function saveConsent(data) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      try { localStorage.setItem(VISITOR_KEY, id); } catch (e) {}
    }
    return id;
  }

  // Skip if already consented
  if (getConsent()) return;

  // ── Fetch config ──
  function fetchConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/cookie-notice/config');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Send consent to server ──
  function sendConsent(given, categories) {
    var data = {
      visitor_id: getVisitorId(),
      consent_given: given,
      categories: categories,
    };
    saveConsent(data);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + '/api/v1/cookie-notice/consent');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  // ── Render Banner ──
  function renderBanner(config) {
    if (!config.enabled) return;

    var isDark = config.theme === 'dark';
    var bg = isDark ? 'rgba(17,24,39,0.97)' : 'rgba(255,255,255,0.97)';
    var text = isDark ? '#f3f4f6' : '#1f2937';
    var muted = isDark ? '#9ca3af' : '#6b7280';
    var btnBg = isDark ? '#4f46e5' : '#4f46e5';
    var btnText = '#fff';
    var borderC = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

    var position = config.position || 'bottom';
    var isCenter = position === 'center';
    var isTop = position === 'top';

    // Overlay for center/modal
    var overlay = null;
    if (isCenter) {
      overlay = document.createElement('div');
      overlay.id = 'kiban-cookie-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;';
      document.body.appendChild(overlay);
    }

    var banner = document.createElement('div');
    banner.id = 'kiban-cookie-notice';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    var posCSS = isCenter
      ? 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:480px;width:90%;border-radius:16px;'
      : isTop
        ? 'position:fixed;top:0;left:0;right:0;'
        : 'position:fixed;bottom:0;left:0;right:0;';

    banner.style.cssText = posCSS +
      'z-index:99999;background:' + bg + ';color:' + text + ';' +
      'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'box-shadow:0 -4px 32px rgba(0,0,0,0.15);' +
      'border' + (isCenter ? '' : (isTop ? '-bottom' : '-top')) + ':1px solid ' + borderC + ';' +
      'padding:20px 24px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;' +
      'animation:kibanCookieFadeIn 0.3s ease-out;';

    var html = '';
    html += '<style>@keyframes kibanCookieFadeIn{from{opacity:0;transform:' +
      (isCenter ? 'translate(-50%,-50%) scale(0.95)' : 'translateY(' + (isTop ? '-' : '') + '20px)') +
      '}to{opacity:1;transform:' +
      (isCenter ? 'translate(-50%,-50%) scale(1)' : 'translateY(0)') + '}}</style>';

    // Message
    html += '<p style="margin:0 0 16px;line-height:1.6;color:' + text + ';">' + escapeHtml(config.message) + '</p>';

    // Cookie categories (if granular)
    var cats = config.cookieTypes || {};
    var showCategories = cats.analytics || cats.marketing || cats.preferences;

    if (showCategories) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">';
      html += '<label style="opacity:0.6;font-size:13px;display:flex;align-items:center;gap:6px;color:' + muted + ';">' +
        '<input type="checkbox" checked disabled> Necessary</label>';
      if (cats.analytics) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:' + text + ';">' +
          '<input type="checkbox" class="kiban-cat" data-cat="analytics"> Analytics</label>';
      }
      if (cats.marketing) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:' + text + ';">' +
          '<input type="checkbox" class="kiban-cat" data-cat="marketing"> Marketing</label>';
      }
      if (cats.preferences) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:' + text + ';">' +
          '<input type="checkbox" class="kiban-cat" data-cat="preferences"> Preferences</label>';
      }
      html += '</div>';
    }

    // Buttons
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">';
    html += '<button id="kiban-cookie-accept" style="padding:10px 20px;background:' + btnBg + ';color:' + btnText + ';border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">' +
      escapeHtml(config.buttonText || 'Accept') + '</button>';
    html += '<button id="kiban-cookie-decline" style="padding:10px 20px;background:transparent;color:' + muted + ';border:1px solid ' + borderC + ';border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">' +
      escapeHtml(config.declineText || 'Decline') + '</button>';

    if (config.policyUrl) {
      html += '<a href="' + escapeHtml(config.policyUrl) + '" target="_blank" rel="noopener" style="font-size:13px;color:' + muted + ';text-decoration:underline;margin-left:auto;">' +
        'Privacy Policy</a>';
    }
    html += '</div>';

    // Custom CSS
    if (config.customCSS) {
      html += '<style>' + config.customCSS + '</style>';
    }

    banner.innerHTML = html;
    document.body.appendChild(banner);

    // ── Event Handlers ──
    function removeBanner() {
      banner.style.opacity = '0';
      banner.style.transition = 'opacity 0.2s ease';
      setTimeout(function () {
        banner.remove();
        if (overlay) overlay.remove();
      }, 200);
    }

    function getSelectedCategories() {
      var selected = { necessary: true, analytics: false, marketing: false, preferences: false };
      var checkboxes = banner.querySelectorAll('.kiban-cat');
      checkboxes.forEach(function (cb) {
        selected[cb.getAttribute('data-cat')] = cb.checked;
      });
      return selected;
    }

    banner.querySelector('#kiban-cookie-accept').addEventListener('click', function () {
      var categories = showCategories
        ? getSelectedCategories()
        : { necessary: true, analytics: true, marketing: true, preferences: true };
      sendConsent(true, categories);
      removeBanner();
    });

    banner.querySelector('#kiban-cookie-decline').addEventListener('click', function () {
      sendConsent(false, { necessary: true, analytics: false, marketing: false, preferences: false });
      removeBanner();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Initialize ──
  function init() {
    fetchConfig(function (err, res) {
      if (err || !res || !res.data) return;
      renderBanner(res.data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──
  window.KibanCookieNotice = {
    hasConsent: function () { return !!getConsent(); },
    getConsent: getConsent,
    reset: function () {
      localStorage.removeItem(CONSENT_KEY);
      location.reload();
    },
  };
})();
