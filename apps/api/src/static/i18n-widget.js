/**
 * kibanCMS i18n Auto-Translation Widget
 *
 * Drop-in script that automatically translates any website.
 * Works like WPML/TranslatePress — no code changes needed.
 *
 * Embed: <script src="https://your-cms.com/api/v1/i18n/widget.js" data-api-key="YOUR_KEY"></script>
 *
 * Options (data attributes):
 *   data-api-key       — Required. Your kibanCMS API key.
 *   data-position      — Optional. Widget position (bottom-right, bottom-left, top-right, top-left)
 *   data-style         — Optional. Widget style (dropdown, flags, minimal)
 */
(function () {
  'use strict';

  // ── Config ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var POSITION_OVERRIDE = scriptTag.getAttribute('data-position');
  var STYLE_OVERRIDE = scriptTag.getAttribute('data-style');

  // ── State ──
  var languages = [];
  var defaultLang = 'pt';
  var currentLang = getCookie('kiban-lang') || getUrlParam('lang') || null;
  var config = { position: 'bottom-right', style: 'minimal' };
  var originalTexts = new Map(); // node → original text
  var translationCache = {};    // loaded from localStorage
  var isTranslating = false;

  // ── Helpers ──
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;max-age=31536000;SameSite=Lax';
  }

  function getUrlParam(name) {
    return new URL(window.location.href).searchParams.get(name);
  }

  function getCacheKey(lang) {
    return 'kiban-i18n-' + lang + '-' + location.pathname;
  }

  function loadCache(lang) {
    try {
      var raw = localStorage.getItem(getCacheKey(lang));
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Cache valid for 24h
      if (Date.now() - data.ts > 86400000) return null;
      return data.map;
    } catch (e) { return null; }
  }

  function saveCache(lang, map) {
    try {
      localStorage.setItem(getCacheKey(lang), JSON.stringify({ map: map, ts: Date.now() }));
    } catch (e) { /* quota */ }
  }

  // ── DOM Text Extraction ──
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, IFRAME: 1, SVG: 1, CODE: 1, PRE: 1, CANVAS: 1 };
  var MIN_LENGTH = 2;

  function getTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var text = node.textContent.trim();
        if (!text || text.length < MIN_LENGTH) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[node.parentElement.tagName]) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest('#kiban-i18n-widget')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.isContentEditable) return NodeFilter.FILTER_REJECT;
        // Skip if looks like code/data
        if (/^[\d\s.,;:!?@#$%^&*()\-+=<>{}[\]|/\\]+$/.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function getTranslatableAttrs(root) {
    var results = [];
    var els = root.querySelectorAll('[placeholder],[title],[alt]');
    els.forEach(function (el) {
      if (el.closest('#kiban-i18n-widget')) return;
      ['placeholder', 'title', 'alt'].forEach(function (attr) {
        var val = el.getAttribute(attr);
        if (val && val.trim().length >= MIN_LENGTH) {
          results.push({ el: el, attr: attr, text: val.trim() });
        }
      });
    });
    return results;
  }

  // ── Translation Engine ──
  function translatePage(targetLang) {
    if (isTranslating) return;
    if (targetLang === defaultLang) {
      restoreOriginals();
      return;
    }

    // Collect all translatable text
    var textNodes = getTextNodes(document.body);
    var attrItems = getTranslatableAttrs(document.body);

    // Store originals (only first time)
    textNodes.forEach(function (node) {
      if (!originalTexts.has(node)) originalTexts.set(node, node.textContent);
    });
    attrItems.forEach(function (item) {
      var key = item.el.tagName + '|' + item.attr;
      if (!originalTexts.has(key)) originalTexts.set(key, { el: item.el, attr: item.attr, text: item.text });
    });

    // Collect unique strings
    var allTexts = [];
    var textMap = {}; // original → indices to update

    textNodes.forEach(function (node) {
      var orig = originalTexts.get(node) || node.textContent;
      var trimmed = orig.trim();
      if (!textMap[trimmed]) {
        textMap[trimmed] = { nodeIndices: [], attrIndices: [] };
        allTexts.push(trimmed);
      }
      textMap[trimmed].nodeIndices.push(node);
    });

    attrItems.forEach(function (item) {
      var orig = item.text;
      if (!textMap[orig]) {
        textMap[orig] = { nodeIndices: [], attrIndices: [] };
        allTexts.push(orig);
      }
      textMap[orig].attrIndices.push(item);
    });

    if (allTexts.length === 0) return;

    // Check cache first
    var cached = loadCache(targetLang);
    if (cached) {
      applyTranslations(allTexts, cached, textMap);
      return;
    }

    // Fetch translations from API
    isTranslating = true;

    // Batch in chunks of 200
    var BATCH = 200;
    var allTranslated = {};
    var batches = [];
    for (var i = 0; i < allTexts.length; i += BATCH) {
      batches.push(allTexts.slice(i, i + BATCH));
    }

    var completed = 0;
    batches.forEach(function (batch) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', BASE_URL + '/api/v1/i18n/translate-text');
      xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var json = JSON.parse(xhr.responseText);
            var translations = json.data.translations;
            for (var j = 0; j < batch.length; j++) {
              allTranslated[batch[j]] = translations[j];
            }
          } catch (e) { /* parse error */ }
        }
        completed++;
        if (completed === batches.length) {
          isTranslating = false;
          saveCache(targetLang, allTranslated);
          applyTranslations(allTexts, allTranslated, textMap);
        }
      };
      xhr.onerror = function () {
        completed++;
        if (completed === batches.length) isTranslating = false;
      };
      xhr.send(JSON.stringify({ texts: batch, target_lang: targetLang }));
    });
  }

  function applyTranslations(allTexts, translationMap, textMap) {
    allTexts.forEach(function (orig) {
      var translated = translationMap[orig];
      if (!translated) return;
      var entry = textMap[orig];
      if (entry.nodeIndices) {
        entry.nodeIndices.forEach(function (node) {
          // Preserve leading/trailing whitespace from original
          var origFull = originalTexts.get(node) || orig;
          var leadSpace = origFull.match(/^\s*/)[0];
          var trailSpace = origFull.match(/\s*$/)[0];
          node.textContent = leadSpace + translated + trailSpace;
        });
      }
      if (entry.attrIndices) {
        entry.attrIndices.forEach(function (item) {
          item.el.setAttribute(item.attr, translated);
        });
      }
    });
    document.documentElement.lang = currentLang || defaultLang;
  }

  function restoreOriginals() {
    originalTexts.forEach(function (value, key) {
      if (key instanceof Node) {
        key.textContent = value;
      } else if (value && value.el) {
        value.el.setAttribute(value.attr, value.text);
      }
    });
    document.documentElement.lang = defaultLang;
  }

  // ── Language Change Handler ──
  function onLanguageChange(langCode) {
    if (langCode === currentLang) return;
    currentLang = langCode;
    setCookie('kiban-lang', langCode);

    var newUrl = new URL(window.location.href);
    if (langCode === defaultLang) {
      newUrl.searchParams.delete('lang');
    } else {
      newUrl.searchParams.set('lang', langCode);
    }
    window.history.replaceState(null, '', newUrl.toString());

    // Dispatch event for SPA frameworks
    window.dispatchEvent(new CustomEvent('kiban-lang-change', { detail: { lang: langCode } }));

    translatePage(langCode);
    updateWidgetDisplay();
  }

  // ── API Fetchers ──
  function fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Widget Rendering ──
  var widgetEl = null;

  function updateWidgetDisplay() {
    if (!widgetEl) return;
    var circleEl = widgetEl.querySelector('.kiban-circle');
    if (circleEl) circleEl.textContent = (currentLang || defaultLang).toUpperCase();

    var select = widgetEl.querySelector('select');
    if (select) select.value = currentLang || defaultLang;
  }

  function renderWidget() {
    if (languages.length < 2) return;

    var pos = POSITION_OVERRIDE || config.position || 'bottom-right';
    var style = STYLE_OVERRIDE || config.style || 'minimal';

    widgetEl = document.createElement('div');
    widgetEl.id = 'kiban-i18n-widget';

    var posStyles = {
      'bottom-right': 'bottom:80px;right:20px;',
      'bottom-left': 'bottom:80px;left:20px;',
      'top-right': 'top:20px;right:20px;',
      'top-left': 'top:20px;left:20px;',
    };

    widgetEl.style.cssText = 'position:fixed;z-index:99999;' + (posStyles[pos] || posStyles['bottom-right']);

    if (style === 'minimal') {
      renderMinimalWidget();
    } else if (style === 'flags') {
      renderFlagsWidget();
    } else {
      renderDropdownWidget();
    }

    document.body.appendChild(widgetEl);
  }

  function renderMinimalWidget() {
    var isExpanded = false;

    var circleEl = document.createElement('div');
    circleEl.className = 'kiban-circle';
    circleEl.textContent = (currentLang || defaultLang).toUpperCase();

    var pillEl = document.createElement('div');
    pillEl.className = 'kiban-pill';

    languages.forEach(function (lang) {
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-lang', lang.code);
      a.textContent = lang.code;
      pillEl.appendChild(a);
    });

    widgetEl.appendChild(circleEl);
    widgetEl.appendChild(pillEl);

    // Solid theme — works on any background
    function applyTheme() {
      var base = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;letter-spacing:0.06em;cursor:pointer;';

      circleEl.style.cssText = base +
        'background:#2c2c2c;color:#fff;' +
        'width:44px;height:44px;border-radius:50%;display:' + (isExpanded ? 'none' : 'flex') + ';align-items:center;justify-content:center;' +
        'text-transform:uppercase;font-weight:600;font-size:11px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.15);' +
        'transition:opacity 0.3s ease,transform 0.3s ease;';

      pillEl.style.cssText = base +
        'background:#2c2c2c;' +
        'display:' + (isExpanded ? 'flex' : 'none') + ';align-items:center;gap:2px;padding:4px;border-radius:999px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.15);';

      pillEl.querySelectorAll('a[data-lang]').forEach(function (a) {
        var isActive = a.getAttribute('data-lang') === (currentLang || defaultLang);
        a.style.cssText =
          'text-decoration:none;padding:8px 14px;border-radius:999px;' +
          'text-transform:uppercase;font-weight:500;transition:all 0.2s ease;white-space:nowrap;' +
          'color:' + (isActive ? '#fff' : 'rgba(255,255,255,0.5)') + ';' +
          'background:' + (isActive ? 'rgba(255,255,255,0.15)' : 'transparent') + ';';
      });
    }

    applyTheme();

    function toggle() {
      isExpanded = !isExpanded;
      applyTheme();
    }

    circleEl.addEventListener('click', toggle);

    pillEl.querySelectorAll('a[data-lang]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        onLanguageChange(a.getAttribute('data-lang'));
        applyTheme();
        setTimeout(toggle, 200);
      });
    });

    document.addEventListener('click', function (e) {
      if (isExpanded && !widgetEl.contains(e.target)) toggle();
    });
  }

  function renderFlagsWidget() {
    var isExpanded = false;
    var activeLang = currentLang || defaultLang;

    function getFlag(code) {
      var lang = languages.find(function (l) { return l.code === code; });
      return flagEmoji(lang ? (lang.flag || lang.code) : code);
    }

    // Container
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;align-items:center;gap:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

    // Active flag button (always visible)
    var activeBtn = document.createElement('button');
    activeBtn.className = 'kiban-flag-active';
    activeBtn.style.cssText = 'background:#fff;border:none;border-radius:50%;width:46px;height:46px;' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;line-height:1;' +
      'box-shadow:0 2px 12px rgba(0,0,0,0.12);transition:transform 0.2s ease,box-shadow 0.2s ease;position:relative;z-index:2;';
    activeBtn.textContent = getFlag(activeLang);
    activeBtn.title = 'Change language';

    activeBtn.addEventListener('mouseenter', function () { activeBtn.style.transform = 'scale(1.08)'; });
    activeBtn.addEventListener('mouseleave', function () { if (!isExpanded) activeBtn.style.transform = 'scale(1)'; });

    // Expandable tray (hidden by default)
    var tray = document.createElement('div');
    tray.className = 'kiban-flag-tray';
    tray.style.cssText = 'display:flex;align-items:center;gap:2px;background:#fff;' +
      'border-radius:23px;padding:4px 6px;margin-left:-8px;padding-left:14px;' +
      'box-shadow:0 2px 12px rgba(0,0,0,0.12);' +
      'max-width:0;overflow:hidden;opacity:0;' +
      'transition:max-width 0.25s ease,opacity 0.2s ease,padding 0.25s ease;';

    // Build other language buttons
    languages.forEach(function (lang) {
      if (lang.code === activeLang) return;
      var btn = document.createElement('button');
      btn.setAttribute('data-lang', lang.code);
      btn.style.cssText = 'background:none;border:none;border-radius:50%;width:36px;height:36px;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;line-height:1;' +
        'opacity:0.7;transition:opacity 0.15s,transform 0.15s,background 0.15s;flex-shrink:0;';
      btn.textContent = getFlag(lang.code);
      btn.title = lang.name;

      btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; btn.style.background = 'rgba(0,0,0,0.05)'; });
      btn.addEventListener('mouseleave', function () { btn.style.opacity = '0.7'; btn.style.background = 'none'; });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        onLanguageChange(lang.code);
        activeLang = lang.code;
        activeBtn.textContent = getFlag(lang.code);
        collapse();
        setTimeout(function () { rebuildTray(); }, 250);
      });
      tray.appendChild(btn);
    });

    container.appendChild(activeBtn);
    container.appendChild(tray);
    widgetEl.appendChild(container);

    function expand() {
      isExpanded = true;
      tray.style.maxWidth = (languages.length * 44) + 'px';
      tray.style.opacity = '1';
      tray.style.padding = '4px 6px 4px 14px';
      activeBtn.style.transform = 'scale(1.08)';
    }

    function collapse() {
      isExpanded = false;
      tray.style.maxWidth = '0';
      tray.style.opacity = '0';
      tray.style.padding = '4px 0 4px 0';
      activeBtn.style.transform = 'scale(1)';
    }

    function rebuildTray() {
      tray.innerHTML = '';
      languages.forEach(function (lang) {
        if (lang.code === activeLang) return;
        var btn = document.createElement('button');
        btn.setAttribute('data-lang', lang.code);
        btn.style.cssText = 'background:none;border:none;border-radius:50%;width:36px;height:36px;' +
          'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;line-height:1;' +
          'opacity:0.7;transition:opacity 0.15s,transform 0.15s,background 0.15s;flex-shrink:0;';
        btn.textContent = getFlag(lang.code);
        btn.title = lang.name;

        btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; btn.style.background = 'rgba(0,0,0,0.05)'; });
        btn.addEventListener('mouseleave', function () { btn.style.opacity = '0.7'; btn.style.background = 'none'; });
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          onLanguageChange(lang.code);
          activeLang = lang.code;
          activeBtn.textContent = getFlag(lang.code);
          collapse();
          setTimeout(function () { rebuildTray(); }, 250);
        });
        tray.appendChild(btn);
      });
    }

    activeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isExpanded) collapse(); else expand();
    });

    document.addEventListener('click', function (e) {
      if (isExpanded && !widgetEl.contains(e.target)) collapse();
    });
  }

  function renderDropdownWidget() {
    var activeLang = languages.find(function (l) { return l.code === (currentLang || defaultLang); }) || languages[0];
    var html = '<div style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 14px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.08);font-family:-apple-system,sans-serif;">';
    html += '<span class="kiban-flag" style="font-size:20px;line-height:1;">' + flagEmoji(activeLang.flag || activeLang.code) + '</span>';
    html += '<select style="background:none;border:none;font-size:14px;font-weight:500;color:#171717;cursor:pointer;outline:none;padding:0;font-family:inherit;-webkit-appearance:none;appearance:none;padding-right:16px;">';
    languages.forEach(function (lang) {
      html += '<option value="' + lang.code + '"' + (lang.code === (currentLang || defaultLang) ? ' selected' : '') + '>' + lang.name + '</option>';
    });
    html += '</select></div>';
    widgetEl.innerHTML = html;

    var select = widgetEl.querySelector('select');
    select.addEventListener('change', function () {
      onLanguageChange(select.value);
      var active = languages.find(function (l) { return l.code === select.value; });
      var flagEl = widgetEl.querySelector('.kiban-flag');
      if (flagEl && active) flagEl.textContent = flagEmoji(active.flag || active.code);
    });
  }

  function flagEmoji(code) {
    var map = {
      pt: '\uD83C\uDDF5\uD83C\uDDF9', gb: '\uD83C\uDDEC\uD83C\uDDE7',
      es: '\uD83C\uDDEA\uD83C\uDDF8', fr: '\uD83C\uDDEB\uD83C\uDDF7',
      de: '\uD83C\uDDE9\uD83C\uDDEA', it: '\uD83C\uDDEE\uD83C\uDDF9',
      nl: '\uD83C\uDDF3\uD83C\uDDF1', ru: '\uD83C\uDDF7\uD83C\uDDFA',
      cn: '\uD83C\uDDE8\uD83C\uDDF3', jp: '\uD83C\uDDEF\uD83C\uDDF5',
      kr: '\uD83C\uDDF0\uD83C\uDDF7', sa: '\uD83C\uDDF8\uD83C\uDDE6',
    };
    return map[code] || '\uD83C\uDFF3\uFE0F';
  }

  // ── Initialize ──
  function init() {
    fetchJSON(BASE_URL + '/api/v1/i18n/widget', function (err, res) {
      if (!err && res && res.data) {
        config.position = res.data.position || config.position;
        config.style = res.data.style || config.style;
      }

      fetchJSON(BASE_URL + '/api/v1/i18n/languages', function (err, res) {
        if (err || !res || !res.data) return;

        defaultLang = res.data.default || 'pt';
        languages = res.data.available || [];
        if (!currentLang) currentLang = defaultLang;

        renderWidget();

        // Auto-translate if not default language
        if (currentLang && currentLang !== defaultLang) {
          translatePage(currentLang);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──
  window.KibanI18n = {
    getLanguage: function () { return currentLang || defaultLang; },
    setLanguage: function (code) { onLanguageChange(code); },
    getLanguages: function () { return languages; },
    translatePage: function (lang) { translatePage(lang || currentLang); },
  };
})();
