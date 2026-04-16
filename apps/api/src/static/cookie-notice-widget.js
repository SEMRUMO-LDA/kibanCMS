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

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
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
      id = 'v_' + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
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

    var position = config.position || 'bottom';
    var isCenter = position === 'center';
    var isTop = position === 'top';

    // Overlay for center/modal
    var overlay = null;
    if (isCenter) {
      overlay = document.createElement('div');
      overlay.id = 'kiban-cookie-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99998;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
      document.body.appendChild(overlay);
    }

    var banner = document.createElement('div');
    banner.id = 'kiban-cookie-notice';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    var posCSS = isCenter
      ? 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:440px;width:calc(100% - 32px);border-radius:12px;'
      : isTop
        ? 'position:fixed;top:0;left:0;right:0;'
        : 'position:fixed;bottom:0;left:0;right:0;';

    banner.style.cssText = posCSS +
      'z-index:99999;background:#fff;color:#1a1a1a;' +
      'box-shadow:0 -1px 24px rgba(0,0,0,0.08);' +
      'border' + (isCenter ? '' : (isTop ? '-bottom' : '-top')) + ':1px solid rgba(0,0,0,0.06);' +
      'padding:20px 24px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;' +
      'animation:kibanCookieFadeIn 0.3s ease-out;';

    var html = '';
    html += '<style>';
    html += '@keyframes kibanCookieFadeIn{from{opacity:0;transform:' +
      (isCenter ? 'translate(-50%,-50%) scale(0.97)' : 'translateY(' + (isTop ? '-' : '') + '12px)') +
      '}to{opacity:1;transform:' +
      (isCenter ? 'translate(-50%,-50%) scale(1)' : 'translateY(0)') + '}}';
    html += '#kiban-cookie-notice *{box-sizing:border-box;}';
    html += '#kiban-cookie-notice button{transition:opacity 0.15s ease;}';
    html += '#kiban-cookie-notice button:hover{opacity:0.85;}';
    html += '</style>';

    // Message
    var message = config.message || 'We use cookies to improve your experience. By continuing to visit this site you agree to our use of cookies.';
    html += '<p style="margin:0 0 16px;color:#3d3d3d;font-size:14px;line-height:1.6;">' + escapeHtml(message) + '</p>';

    // Cookie categories (if granular)
    var cats = config.cookieTypes || {};
    var showCategories = cats.analytics || cats.marketing || cats.preferences;

    if (showCategories) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;">';
      html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:#999;cursor:default;">' +
        '<input type="checkbox" checked disabled style="accent-color:#1a1a1a;"> Necessary</label>';
      if (cats.analytics) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:#3d3d3d;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="analytics" style="accent-color:#1a1a1a;"> Analytics</label>';
      }
      if (cats.marketing) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:#3d3d3d;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="marketing" style="accent-color:#1a1a1a;"> Marketing</label>';
      }
      if (cats.preferences) {
        html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;color:#3d3d3d;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="preferences" style="accent-color:#1a1a1a;"> Preferences</label>';
      }
      html += '</div>';
    }

    // Buttons
    html += '<div style="display:flex;gap:10px;align-items:center;justify-content:flex-end;">';
    html += '<button id="kiban-cookie-accept" style="padding:9px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;letter-spacing:0.01em;">' +
      escapeHtml(config.buttonText || 'Accept') + '</button>';
    html += '<button id="kiban-cookie-decline" style="padding:9px 20px;background:transparent;color:#888;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">' +
      escapeHtml(config.declineText || 'Decline') + '</button>';

    if (config.policyUrl) {
      html += '<a href="' + escapeHtml(config.policyUrl) + '" target="_blank" rel="noopener" style="font-size:12px;color:#999;text-decoration:none;margin-left:auto;border-bottom:1px solid #ddd;">' +
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
