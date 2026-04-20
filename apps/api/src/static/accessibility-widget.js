/**
 * kibanCMS Accessibility Widget
 *
 * EAA 2025-compliant floating accessibility panel.
 * Reads configuration from the CMS and provides real CSS adjustments.
 *
 * Embed: <script src="https://your-cms.com/api/v1/accessibility/widget.js" data-api-key="YOUR_KEY"></script>
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
  var PREFS_KEY = 'kiban_a11y_prefs';

  // ── Preferences ──
  var defaults = { fontSize: 0, contrast: false, reducedMotion: false, lineSpacing: 0, largeCursor: false, textAlign: false };

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : Object.assign({}, defaults);
    } catch (e) { return Object.assign({}, defaults); }
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  var prefs = loadPrefs();

  // ── Fetch config ──
  function fetchConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/accessibility/config');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Apply CSS adjustments ──
  function applyToDOM() {
    var html = document.documentElement;

    // Font size
    var sizes = ['', '120%', '140%'];
    html.style.fontSize = sizes[prefs.fontSize] || '';

    // High contrast
    html.classList.toggle('a11y-high-contrast', prefs.contrast);

    // Reduced motion
    html.classList.toggle('a11y-reduced-motion', prefs.reducedMotion);

    // Line spacing
    var spacings = ['', '1.8', '2.2'];
    html.style.setProperty('--a11y-line-height', spacings[prefs.lineSpacing] || '');
    if (prefs.lineSpacing > 0) {
      document.body.style.lineHeight = 'var(--a11y-line-height)';
    } else {
      document.body.style.lineHeight = '';
    }

    // Large cursor
    html.classList.toggle('a11y-large-cursor', prefs.largeCursor);

    // Readable text
    html.classList.toggle('a11y-readable-text', prefs.textAlign);

    // Inject global styles once
    if (!document.getElementById('kiban-a11y-styles')) {
      var style = document.createElement('style');
      style.id = 'kiban-a11y-styles';
      style.textContent =
        '.a11y-high-contrast{filter:contrast(1.4)!important}' +
        '.a11y-high-contrast img,.a11y-high-contrast video{filter:contrast(0.7)!important}' +
        '.a11y-reduced-motion,.a11y-reduced-motion *{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}' +
        '.a11y-large-cursor,.a11y-large-cursor *{cursor:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 32 32\'%3E%3Cpath d=\'M5 2l20 14-9 2-5 10-2-1 4-9-8-3z\' fill=\'%23000\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3C/svg%3E") 4 2,auto!important}' +
        '.a11y-readable-text{text-align:left!important;word-spacing:0.12em!important;letter-spacing:0.03em!important}';
      document.head.appendChild(style);
    }
  }

  // Apply saved prefs immediately
  applyToDOM();

  // ── Render Widget ──
  function renderWidget(config) {
    if (!config.enabled) return;

    var position = config.position || 'bottom-left';
    var features = config.features || {};
    var buttonLabel = config.buttonLabel || 'Accessibility settings';

    // Detect theme
    var theme = config.theme || 'auto';
    if (theme === 'auto') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var isDark = theme === 'dark';
    var panelBg = isDark ? '#1f2937' : '#ffffff';
    var panelText = isDark ? '#f3f4f6' : '#1f2937';
    var panelMuted = isDark ? '#9ca3af' : '#6b7280';
    var panelBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    var accent = '#4f46e5';

    // Position styles
    var posMap = {
      'bottom-left': 'bottom:20px;left:20px;',
      'bottom-right': 'bottom:20px;right:20px;',
      'top-left': 'top:20px;left:20px;',
      'top-right': 'top:20px;right:20px;',
    };
    var panelPosMap = {
      'bottom-left': 'bottom:76px;left:20px;',
      'bottom-right': 'bottom:76px;right:20px;',
      'top-left': 'top:76px;left:20px;',
      'top-right': 'top:76px;right:20px;',
    };

    // ── Toggle Button ──
    var btn = document.createElement('button');
    btn.id = 'kiban-a11y-btn';
    btn.setAttribute('aria-label', buttonLabel);
    btn.style.cssText = 'position:fixed;z-index:2147483600;' + (posMap[position] || posMap['bottom-left']) +
      'width:44px;height:44px;border-radius:50%;border:none;background:#2c2c2c;color:#fff;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 2px 12px rgba(0,0,0,0.15);transition:transform 0.2s ease;';
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="2.5" r="2.5"/><path d="M12 7c-1.1 0-2 .9-2 2v4h-3l1.5 8h1.6L11.5 15h1l1.4 6h1.6l1.5-8h-3V9c0-1.1-.9-2-2-2z"/><path d="M16.5 9.5L19 8M7.5 9.5L5 8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>';
    btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });

    // ── Panel ──
    var panel = document.createElement('div');
    panel.id = 'kiban-a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Accessibility preferences');
    panel.style.cssText = 'position:fixed;z-index:2147483601;' + (panelPosMap[position] || panelPosMap['bottom-left']) +
      'width:320px;max-height:80vh;overflow-y:auto;background:' + panelBg + ';color:' + panelText + ';' +
      'border-radius:16px;border:1px solid ' + panelBorder + ';' +
      'box-shadow:0 12px 40px rgba(0,0,0,0.2);padding:20px;display:none;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;' +
      'animation:kibanA11yFadeIn 0.2s ease-out;';

    var html = '<style>@keyframes kibanA11yFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}</style>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<strong style="font-size:16px;">Accessibility</strong>' +
      '<button id="kiban-a11y-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:' + panelMuted + ';padding:0;line-height:1;">&times;</button></div>';

    // Feature: Font Size
    if (features.fontSize !== false) {
      html += featureRow('fontSize', 'Font Size', 'Aa',
        stepButtons('fontSize', 3, ['Normal', 'Large', 'Extra Large']));
    }
    // Feature: Contrast
    if (features.contrast !== false) {
      html += featureRow('contrast', 'High Contrast', '\u25D0', toggleBtn('contrast'));
    }
    // Feature: Reduced Motion
    if (features.reducedMotion !== false) {
      html += featureRow('reducedMotion', 'Reduce Animations', '\u23F8', toggleBtn('reducedMotion'));
    }
    // Feature: Line Spacing
    if (features.lineSpacing !== false) {
      html += featureRow('lineSpacing', 'Line Spacing', '\u2261',
        stepButtons('lineSpacing', 3, ['Normal', 'Wide', 'Extra Wide']));
    }
    // Feature: Large Cursor
    if (features.largeCursor !== false) {
      html += featureRow('largeCursor', 'Large Cursor', '\u2197', toggleBtn('largeCursor'));
    }
    // Feature: Readable Text
    if (features.textAlign !== false) {
      html += featureRow('textAlign', 'Readable Text', '\u2630', toggleBtn('textAlign'));
    }

    // Reset button
    html += '<button id="kiban-a11y-reset" style="width:100%;margin-top:12px;padding:10px;background:' +
      (isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6') + ';border:none;border-radius:8px;cursor:pointer;' +
      'font-size:13px;color:' + panelMuted + ';font-weight:500;">Reset to defaults</button>';

    // Custom CSS
    if (config.customCSS) {
      html += '<style>' + config.customCSS + '</style>';
    }

    panel.innerHTML = html;
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // ── Toggle panel ──
    var isOpen = false;
    btn.addEventListener('click', function () {
      isOpen = !isOpen;
      panel.style.display = isOpen ? 'block' : 'none';
      btn.setAttribute('aria-expanded', isOpen);
    });

    panel.querySelector('#kiban-a11y-close').addEventListener('click', function () {
      isOpen = false;
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', function (e) {
      if (isOpen && !panel.contains(e.target) && e.target !== btn) {
        isOpen = false;
        panel.style.display = 'none';
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // ── Bind controls ──
    // Toggles
    panel.querySelectorAll('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-toggle');
        prefs[key] = !prefs[key];
        savePrefs(prefs);
        applyToDOM();
        updateUI();
      });
    });

    // Step buttons
    panel.querySelectorAll('[data-step]').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-step');
        var max = parseInt(el.getAttribute('data-max'), 10);
        prefs[key] = (prefs[key] + 1) % max;
        savePrefs(prefs);
        applyToDOM();
        updateUI();
      });
    });

    // Reset
    panel.querySelector('#kiban-a11y-reset').addEventListener('click', function () {
      prefs = Object.assign({}, defaults);
      savePrefs(prefs);
      applyToDOM();
      updateUI();
    });

    function updateUI() {
      // Update toggle states
      panel.querySelectorAll('[data-toggle]').forEach(function (el) {
        var key = el.getAttribute('data-toggle');
        var active = prefs[key];
        el.style.background = active ? accent : (isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb');
        el.querySelector('span').style.left = active ? '20px' : '2px';
      });
      // Update step labels
      panel.querySelectorAll('[data-step]').forEach(function (el) {
        var key = el.getAttribute('data-step');
        var labels = el.getAttribute('data-labels').split(',');
        el.textContent = labels[prefs[key]] || labels[0];
      });
    }

    updateUI();
  }

  function featureRow(key, label, icon, controlHtml) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(128,128,128,0.15);">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<span style="font-size:18px;width:24px;text-align:center;">' + icon + '</span>' +
      '<span style="font-weight:500;">' + label + '</span></div>' +
      controlHtml + '</div>';
  }

  function toggleBtn(key) {
    var active = prefs[key];
    return '<button data-toggle="' + key + '" style="width:40px;height:22px;border-radius:11px;border:none;position:relative;cursor:pointer;' +
      'background:' + (active ? '#4f46e5' : '#e5e7eb') + ';transition:background 0.2s;flex-shrink:0;">' +
      '<span style="position:absolute;top:2px;width:18px;height:18px;border-radius:50%;background:#fff;' +
      'transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);left:' + (active ? '20px' : '2px') + ';"></span></button>';
  }

  function stepButtons(key, max, labels) {
    return '<button data-step="' + key + '" data-max="' + max + '" data-labels="' + labels.join(',') + '" ' +
      'style="padding:4px 12px;border-radius:6px;border:1px solid rgba(128,128,128,0.2);background:none;' +
      'cursor:pointer;font-size:12px;font-weight:500;color:inherit;min-width:80px;text-align:center;">' +
      labels[prefs[key]] + '</button>';
  }

  // ── Initialize ──
  function init() {
    fetchConfig(function (err, res) {
      if (err || !res || !res.data) return;
      renderWidget(res.data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──
  window.KibanAccessibility = {
    getPrefs: loadPrefs,
    reset: function () {
      localStorage.removeItem(PREFS_KEY);
      location.reload();
    },
  };
})();
