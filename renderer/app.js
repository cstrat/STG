/* ═══════════════════════════════════════════════════════════════════
   STG — SASE Traffic Generator  |  app.js
   Works standalone in a browser (mock mode) and inside Electron
   (real HTTP/browser traffic via IPC).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const IS_ELECTRON = typeof window.electronAPI !== 'undefined';

  let BUILD_INFO = { version: '?', commit: '?', built: '?', branch: '—' };
  async function loadBuildInfo() {
    try {
      const resp = await fetch('version.json');
      if (resp.ok) BUILD_INFO = await resp.json();
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────
  // DEFAULT CONFIGURATION
  // ─────────────────────────────────────────────────────────────────

  const DEFAULT_CONFIG = {
    categories: {
      ai: {
        id: 'ai', label: 'ARTIFICIAL INTELLIGENCE', short: 'AI',
        color: 'var(--cat-ai)', cssVar: '--cat-ai',
        enabled: true, speed: 'slow', mode: 'http',
        urls: [
          'chatgpt.com/', 'claude.ai/', 'openai.com/', 'gemini.google.com/',
          'huggingface.co/models', 'stability.ai/', 'character.ai/',
          'midjourney.com/', 'perplexity.ai/', 'copilot.microsoft.com/',
        ],
      },
      social: {
        id: 'social', label: 'SOCIAL MEDIA', short: 'SOCIAL',
        color: 'var(--cat-social)', cssVar: '--cat-social',
        enabled: true, speed: 'slow', mode: 'http',
        urls: [
          'x.com/', 'www.facebook.com/', 'www.instagram.com/', 'www.linkedin.com/',
          'www.reddit.com/', 'www.tiktok.com/', 'www.pinterest.com/', 'www.quora.com/',
          'www.snapchat.com/', 'bsky.app/',
        ],
      },
      im: {
        id: 'im', label: 'INSTANT MESSAGING', short: 'INSTANT',
        color: 'var(--cat-im)', cssVar: '--cat-im',
        enabled: true, speed: 'slow', mode: 'http',
        urls: [
          'web.whatsapp.com/', 'web.telegram.org/', 'signal.org/',
          'discord.com/', 'slack.com/', 'teams.microsoft.com/',
          'web.skype.com/', 'messages.google.com/',
        ],
      },
      video: {
        id: 'video', label: 'VIDEO STREAMING', short: 'VIDEO',
        color: 'var(--cat-video)', cssVar: '--cat-video',
        enabled: true, speed: 'slow', mode: 'browser', streamDuration: 15,
        // URLs marked `stream: true` force the hidden BrowserWindow to stay
        // open for streamDuration seconds so video actually plays. Plain URLs
        // use the category's normal mode (HTTP/BROWSER/MIX).
        urls: [
          // YouTube watch pages — autoplay with sound (autoplayPolicy on the
          // BrowserWindow lets them play without a user gesture).
          { url: 'www.youtube.com/watch?v=dQw4w9WgXcQ', stream: true },   // Rickroll
          { url: 'www.youtube.com/watch?v=9bZkp7q19f0', stream: true },   // Gangnam Style
          { url: 'www.youtube.com/watch?v=kJQP7kiw5Fk', stream: true },   // Despacito
          { url: 'www.youtube.com/watch?v=jNQXAC9IVRw', stream: true },   // First-ever YouTube video
          { url: 'vimeo.com/76979871',                  stream: true },
          { url: 'vimeo.com/347119375',                 stream: true },
          // Twitch & Kick directory/channel pages — autoplay the live preview
          { url: 'www.twitch.tv/directory/category/just-chatting',                stream: true },
          { url: 'www.twitch.tv/directory',                                       stream: true },
          { url: 'kick.com/browse/categories',                                    stream: true },
          { url: 'kick.com/xqc',                                                  stream: true },
          // Landing pages — still classified by SASE, regular (non-stream) hits
          'www.youtube.com/', 'www.twitch.tv/', 'www.netflix.com/', 'kick.com/',
          '9now.nine.com.au/', '7plus.com.au/', 'www.binge.com.au/',
          'www.disneyplus.com/', 'www.primevideo.com/', 'www.stan.com.au/',
        ],
      },
      news: {
        id: 'news', label: 'NEWS', short: 'NEWS',
        color: 'var(--cat-news)', cssVar: '--cat-news',
        enabled: true, speed: 'slow', mode: 'http',
        urls: [
          'www.bbc.com/news', 'www.cnn.com/', 'www.afr.com/', 'www.theguardian.com/',
          'www.reuters.com/', 'www.abc.net.au/news', 'www.smh.com.au/',
          'apnews.com/', 'www.news.com.au/', 'www.skynews.com.au/',
        ],
      },
      malicious: {
        id: 'malicious', label: 'MALICIOUS', short: 'MALICIOUS',
        color: 'var(--cat-malicious)', cssVar: '--cat-malicious',
        enabled: true, speed: 'slow', mode: 'http',
        urls: [
          'phishtank.org/', 'malware.wicar.org/', 'www.eicar.org/',
          'urlhaus.abuse.ch/', 'openphish.com/', 'bazaar.abuse.ch/',
        ],
      },
    },
    settings: {
      requestMode: 'http',
      timeout: 15,
      crawlDepth: 1,
      blockSignatures: ['FortiGuard', 'Web Page Blocked', 'Access Denied', 'fortinet', 'URL blocked'],
      attack: {
        portScan:     { enabled: true, target: '8.8.8.8', ports: [22, 23, 445, 3389, 4444, 1337, 8080, 5900, 3306, 27017] },
        eicar:        { enabled: true, urls: ['www.eicar.org/download/eicar.com', 'www.eicar.org/download/eicar_com.zip', 'www.eicar.org/download/eicar.com.txt'] },
        c2Beacons:    { enabled: true, urls: ['malware.wicar.org/', 'bazaar.abuse.ch/', 'malware.wicar.org/data/ms14_064_ole_code_exec.html'] },
        phishing:     { enabled: true, urls: ['phishtank.org/', 'urlhaus.abuse.ch/'] },
        exfiltration: { enabled: true, urls: ['openphish.com/'] },
      },
    },
  };

  // Speed intervals in ms
  const SPEEDS = { slow: 15000, medium: 6000, fast: 2000 };

  // Attack sequence — each event runs ~1–2 seconds apart
  // Descriptor for each attack vector — drives both overlay toggles and URL editor
  const ATTACK_VECTORS = [
    { key: 'portScan',     label: 'PORT SCAN',         desc: 'TCP connect on common attack ports', hasPorts: true },
    { key: 'eicar',        label: 'EICAR DOWNLOADS',   desc: 'Antivirus test file download attempts' },
    { key: 'c2Beacons',   label: 'C2 BEACONS',        desc: 'Malware command & control contact' },
    { key: 'phishing',     label: 'PHISHING',          desc: 'Phishing kit infrastructure contact' },
    { key: 'exfiltration', label: 'DATA EXFILTRATION', desc: 'Simulate data exfiltration beacons' },
  ];

  // Build the attack sequence dynamically from current config
  function buildAttackSequence() {
    const atk = state.config.settings.attack;
    const steps = [];

    if (atk.portScan.enabled) {
      const ports = atk.portScan.ports || [];
      for (let i = 0; i < ports.length; i += 4) {
        const chunk = ports.slice(i, i + 4);
        steps.push({ phase: 'Scanning for open ports...', type: 'scan', url: '—', desc: `Port scan: ${chunk.join(', ')}`, ports: chunk });
      }
    }
    if (atk.eicar.enabled) {
      atk.eicar.urls.forEach(url => steps.push({ phase: 'Attempting EICAR download...', type: 'eicar', url, desc: 'EICAR test file download' }));
    }
    if (atk.c2Beacons.enabled) {
      atk.c2Beacons.urls.forEach(url => steps.push({ phase: 'C2 beacon attempt...', type: 'c2', url, desc: 'Command & control beacon' }));
    }
    if (atk.phishing.enabled) {
      atk.phishing.urls.forEach(url => steps.push({ phase: 'Phishing infrastructure contact...', type: 'c2', url, desc: 'Phishing kit contact' }));
    }
    if (atk.exfiltration.enabled) {
      atk.exfiltration.urls.forEach(url => steps.push({ phase: 'Data exfiltration attempt...', type: 'c2', url, desc: 'Data exfiltration beacon' }));
    }

    return steps;
  }

  // ─────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────

  const state = {
    running:      false,
    startTime:    null,
    config:       null,       // loaded/merged on init
    events:       [],         // all log events
    filter:       'all',
    timers:       {},         // per-category setTimeouts
    stats:        {},         // per-category counters
    mixedState:   {},         // catId -> 'http'|'browser', alternates for MIXED mode
    attackRuns:   [],         // history of completed attack simulations, for the report
    livePreview:  false,      // in-app tiled webview preview visible?
    attackRunning: false,
    attackAborted: false,
    configOpen:   false,
    urlEditorOpen: false,
    reportOpen:   false,
    uptimeTimer:  null,
    tickTimer:    null,
    recentBytes:  [],         // [{ts, tx, rx}] for rate calc
  };

  // Apply active/inactive styling to a segmented button with category colour
  function setBtnActive(btn, active, cssVar) {
    if (active) {
      const color = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      btn.style.backgroundColor = color;
      btn.style.borderColor     = color;
      btn.style.color           = 'var(--bg)';
    } else {
      btn.style.backgroundColor = '';
      btn.style.borderColor     = '';
      btn.style.color           = '';
    }
  }

  // Resolve the actual request mode for a category, handling MIXED alternation
  function resolveMode(catId) {
    const cat = state.config.categories[catId];
    if (!cat) return 'http';
    if (cat.mode !== 'mixed') return cat.mode || 'http';
    // Alternate http → browser → http each request
    const next = state.mixedState[catId] === 'http' ? 'browser' : 'http';
    state.mixedState[catId] = next;
    return next;
  }

  // URLs are either plain strings or { url, stream } objects — unify access:
  function urlOf(entry)    { return typeof entry === 'string' ? entry : (entry && entry.url) || ''; }
  function isStream(entry) { return typeof entry === 'object' && entry !== null && entry.stream === true; }

  // Navigate a category's live-preview webview tile to the given URL
  function setPreviewTile(catId, url) {
    const tile = document.querySelector(`.preview-tile[data-cat="${catId}"] .preview-url`);
    if (tile) tile.textContent = url;
  }

  // ─────────────────────────────────────────────────────────────────
  // WEBVIEW REQUEST — runs BROWSER / STREAM requests in the tile's
  // <webview>, so the thing you see is the thing we measure. Bytes
  // come from the main-process session hook on persist:stg-preview.
  // ─────────────────────────────────────────────────────────────────

  // Each category has its own tile webview — serialise per-cat so we don't
  // navigate one webview while it's still loading the previous URL.
  const webviewLocks = {};

  function getTileWebview(catId) {
    return document.getElementById(`pv-${catId}`);
  }

  // Navigate a webview to a URL and wait for did-finish-load / did-fail-load.
  // Returns { ok, code, desc } — ok is true on finish, false on fail/timeout.
  function navigateWebview(wv, fullUrl, timeoutMs = 20000) {
    return new Promise((resolve) => {
      let done = false;
      const onFinish = () => { if (!done) { done = true; cleanup(); resolve({ ok: true }); } };
      const onFail   = (e) => { if (!done) { done = true; cleanup(); resolve({ ok: false, code: e.errorCode, desc: e.errorDescription }); } };
      const cleanup = () => {
        wv.removeEventListener('did-finish-load', onFinish);
        wv.removeEventListener('did-fail-load',   onFail);
        clearTimeout(t);
      };
      wv.addEventListener('did-finish-load', onFinish);
      wv.addEventListener('did-fail-load',   onFail);
      const t = setTimeout(() => { if (!done) { done = true; cleanup(); resolve({ ok: false, code: -7, desc: 'Load timeout' }); } }, timeoutMs);
      try { wv.src = fullUrl; } catch (e) { onFail({ errorCode: -2, errorDescription: e.message }); }
    });
  }

  async function webviewRequest(catId, url, mode, opts) {
    // Avoid overlapping navigations on the same tile
    if (webviewLocks[catId]) await webviewLocks[catId];
    let releaseLock;
    webviewLocks[catId] = new Promise(r => { releaseLock = r; });

    const startTime = Date.now();
    const fullUrl   = url.startsWith('http') ? url : `https://${url}`;
    const wv = getTileWebview(catId);

    if (!wv) {
      releaseLock && releaseLock();
      delete webviewLocks[catId];
      return { url, mode, outcome: 'err', code: 0, response: 'No preview tile', txBytes: 0, rxBytes: 0 };
    }

    // Update the small URL label above the tile
    setPreviewTile(catId, fullUrl);

    // Reset byte counter for this specific webview
    let wcId;
    try { wcId = wv.getWebContentsId(); }
    catch (_) { wcId = null; }
    if (wcId != null) await window.electronAPI.webviewBytesReset(wcId);

    // Initial navigation
    const initial = await navigateWebview(wv, fullUrl);
    if (!initial.ok) {
      const bytes = wcId != null ? await window.electronAPI.webviewBytesGet(wcId) : { tx: 0, rx: 0 };
      releaseLock && releaseLock();
      delete webviewLocks[catId];
      const likelyBlock = Math.abs(initial.code) === 20 || Math.abs(initial.code) === 6;
      return { url, mode, outcome: likelyBlock ? 'blocked' : 'err', code: initial.code || 0, response: initial.desc || 'Load failed', txBytes: bytes.tx, rxBytes: bytes.rx };
    }

    // BROWSER mode: optionally click through crawlDepth - 1 random links
    if (mode === 'browser' && opts.crawlDepth > 1) {
      const visited = new Set([fullUrl]);
      for (let i = 1; i < opts.crawlDepth; i++) {
        if (!state.running) break;
        let links = [];
        try {
          links = await wv.executeJavaScript(`
            Array.from(document.querySelectorAll('a[href]'))
              .map(a => a.href)
              .filter(h => /^https?:/.test(h))
              .filter(h => !h.includes('#'))
          `);
        } catch (_) { break; }
        if (!state.running) break;
        const available = (links || []).filter(l => !visited.has(l));
        if (available.length === 0) break;
        const next = available[Math.floor(Math.random() * available.length)];
        setPreviewTile(catId, next);
        const r = await navigateWebview(wv, next);
        visited.add(next);
        if (!r.ok) break;
      }
    }

    // STREAM mode: hold the tile on the current page so video plays/buffers.
    // Poll state.running so STOP can break out instantly instead of waiting
    // up to streamDuration seconds for the timer to fire.
    if (mode === 'stream') {
      const loadTime = Date.now() - startTime;
      const hold = Math.max(1000, (opts.streamDuration || 15) * 1000 - loadTime);
      const holdEnd = Date.now() + hold;
      while (Date.now() < holdEnd) {
        if (!state.running) break;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Classify the final landed page
    let bodyText = '';
    try { bodyText = await wv.executeJavaScript('document.body ? document.body.innerText.substring(0, 3000) : ""'); } catch (_) {}
    const finalUrl = (() => { try { return wv.getURL(); } catch { return fullUrl; } })();
    const cls = await window.electronAPI.classifyResponse({
      status: 200, bodySnippet: bodyText || '', finalUrl, sigs: opts.blockSignatures || [],
    });

    const bytes = wcId != null ? await window.electronAPI.webviewBytesGet(wcId) : { tx: 0, rx: 0 };

    let outcome, response;
    if (!state.running) {
      // User hit STOP while this request was in flight — surface that in the log
      outcome = 'err';
      response = 'Stopped';
    } else if (cls.challenge) {
      outcome = 'challenge';
      response = 'CF Challenge';
    } else if (cls.blocked) {
      outcome = 'blocked';
      response = 'Block page served (HTTP 200)';
    } else {
      outcome = 'ok';
      response = '';
    }

    releaseLock && releaseLock();
    delete webviewLocks[catId];

    return { url, mode, outcome, code: outcome === 'err' ? 0 : 200, response, txBytes: bytes.tx, rxBytes: bytes.rx };
  }

  // ─────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────

  function fmtBytes(b) {
    if (b === 0 || b == null) return '0B';
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (b / 1024).toFixed(1) + 'K';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + 'M';
    return (b / 1073741824).toFixed(2) + 'G';
  }

  function fmtTime(d) {
    return d.toTimeString().slice(0, 8);
  }

  function fmtUptime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getCatColor(catId) {
    const c = state.config.categories[catId];
    return c ? getComputedStyle(document.documentElement).getPropertyValue(c.cssVar).trim() : '#888';
  }

  // ─────────────────────────────────────────────────────────────────
  // CONFIG — load / save / merge
  // ─────────────────────────────────────────────────────────────────

  function defaultStats() {
    const s = {};
    const zero = () => ({ sent: 0, ok: 0, cha: 0, wrn: 0, blk: 0, err: 0, txBytes: 0, rxBytes: 0 });
    Object.keys(DEFAULT_CONFIG.categories).forEach(k => { s[k] = zero(); });
    s.attack = zero();
    return s;
  }

  async function loadConfig() {
    let saved = null;
    if (IS_ELECTRON) {
      saved = await window.electronAPI.loadConfig();
    } else {
      const raw = localStorage.getItem('stg-config');
      if (raw) { try { saved = JSON.parse(raw); } catch (_) {} }
    }

    // Always start from a clean copy of defaults
    state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    if (saved) {
      if (saved.categories) {
        Object.keys(saved.categories).forEach(k => {
          if (state.config.categories[k]) {
            Object.assign(state.config.categories[k], saved.categories[k]);
          }
        });
      }
      if (saved.settings) {
        // Shallow-merge top-level settings keys except attack (needs special handling)
        const { attack: savedAttack, ...otherSettings } = saved.settings;
        Object.assign(state.config.settings, otherSettings);

        // Migrate attack config: old format had flat booleans { portScan: true, ... }
        // New format has nested objects { portScan: { enabled, target, ports }, ... }
        if (savedAttack && typeof savedAttack.portScan !== 'boolean') {
          // New nested format — deep-merge each vector
          Object.keys(savedAttack).forEach(k => {
            if (state.config.settings.attack[k] && typeof savedAttack[k] === 'object') {
              Object.assign(state.config.settings.attack[k], savedAttack[k]);
            }
          });
        }
        // Old flat format is simply discarded — defaults are already in place
      }
    }
  }

  async function saveConfig() {
    const toSave = {
      categories: {},
      settings: { ...state.config.settings },
    };
    Object.keys(state.config.categories).forEach(k => {
      const c = state.config.categories[k];
      toSave.categories[k] = { enabled: c.enabled, speed: c.speed, urls: [...c.urls] };
    });

    if (IS_ELECTRON) {
      await window.electronAPI.saveConfig(toSave);
    } else {
      localStorage.setItem('stg-config', JSON.stringify(toSave));
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────

  function recordEvent(evt) {
    const bucket = state.stats[evt.category] || state.stats.attack;
    if (!bucket) return;
    bucket.sent++;
    bucket.txBytes += evt.txBytes || 0;
    bucket.rxBytes += evt.rxBytes || 0;
    if (evt.outcome === 'ok')             bucket.ok++;
    else if (evt.outcome === 'blocked')   bucket.blk++;
    else if (evt.outcome === 'challenge') bucket.cha++;
    else if (evt.outcome === 'wrn')       bucket.wrn++;
    else                                  bucket.err++;

    state.recentBytes.push({ ts: Date.now(), tx: evt.txBytes || 0, rx: evt.rxBytes || 0 });
  }

  function getWindowedRate(windowMs) {
    const cutoff = Date.now() - windowMs;
    return state.recentBytes.filter(b => b.ts > cutoff);
  }

  function pruneRecentBytes() {
    const cutoff = Date.now() - 65000;
    state.recentBytes = state.recentBytes.filter(b => b.ts > cutoff);
  }

  function totalStats() {
    const t = { sent: 0, ok: 0, cha: 0, wrn: 0, blk: 0, err: 0, txBytes: 0, rxBytes: 0 };
    Object.values(state.stats).forEach(s => {
      t.sent += s.sent; t.ok += s.ok; t.cha += (s.cha || 0); t.wrn += s.wrn;
      t.blk += s.blk; t.err += s.err;
      t.txBytes += s.txBytes; t.rxBytes += s.rxBytes;
    });
    return t;
  }

  // ─────────────────────────────────────────────────────────────────
  // LOG MANAGEMENT
  // ─────────────────────────────────────────────────────────────────

  function addLogEvent(evt) {
    state.events.unshift(evt);                       // newest first
    if (state.events.length > 2000) state.events.pop();

    recordEvent(evt);
    renderLogRow(evt, true);
    updateFilterCount();
    updateStatsCards();
    updateTopBarLive();
    updateTopbarReportVisibility();
  }

  function updateTopbarReportVisibility() {
    const show = !state.running && state.events.length > 0;
    const report = document.getElementById('btn-topbar-report');
    const reset  = document.getElementById('btn-topbar-reset');
    if (report) report.classList.toggle('hidden', !show);
    if (reset)  reset.classList.toggle('hidden',  !show);
  }

  // Merged clear-log + reset-stats + clear-attack-history into one action
  function resetAll() {
    state.events = [];
    document.getElementById('log-body').innerHTML = '';
    document.getElementById('log-empty').classList.add('visible');
    state.stats       = defaultStats();
    state.recentBytes = [];
    state.attackRuns  = [];
    updateFilterCount();
    updateStatsCards();
    updateTopBarLive();
    updateTopbarReportVisibility();
  }

  function outcomeClass(outcome) {
    if (outcome === 'ok')        return 'ok';
    if (outcome === 'blocked')   return 'blocked';
    if (outcome === 'challenge') return 'challenge';
    if (outcome === 'wrn')       return 'wrn';
    return 'err';
  }

  function statusLabel(outcome) {
    if (outcome === 'ok')        return 'OK';
    if (outcome === 'blocked')   return 'BLOCKED';
    if (outcome === 'challenge') return 'CHALLENGE';
    if (outcome === 'wrn')       return 'WRN';
    return 'ERR';
  }

  function renderLogRow(evt, prepend = false) {
    const tbody = document.getElementById('log-body');
    const oc = outcomeClass(evt.outcome);
    // Code cell colour follows the outcome when it contradicts the raw HTTP
    // status (e.g. 200 + BLOCKED for a block page served with success status),
    // so the log row reads consistently rather than mixing green 200 with red BLOCKED.
    let codeClass;
    if (evt.outcome === 'blocked' || evt.outcome === 'challenge') {
      codeClass = oc;
    } else {
      codeClass = evt.code >= 200 && evt.code < 300 ? 'ok' : (evt.code >= 400 || evt.code === 0 ? 'err' : '');
    }
    const codeStr = evt.code ? String(evt.code) : '—';

    // Visibility
    const visible = state.filter === 'all' || state.filter === evt.category;

    const tr = document.createElement('tr');
    tr.className = `cat-${evt.category} new-row`;
    tr.dataset.cat = evt.category;
    tr.dataset.id = evt.id;
    if (!visible) tr.style.display = 'none';

    tr.innerHTML = `
      <td class="td-time">${evt.timeStr}</td>
      <td class="td-cat cat-${evt.category}">${state.config.categories[evt.category]?.short || evt.category.toUpperCase()}</td>
      <td class="td-status ${oc}">${statusLabel(evt.outcome)}</td>
      <td class="td-mode">${evt.mode.toUpperCase()}</td>
      <td class="td-code ${codeClass}">${codeStr}</td>
      <td class="td-url" title="${evt.url}">${evt.url}</td>
      <td class="td-response ${oc}">${evt.response || ''}</td>
    `;

    if (prepend && tbody.firstChild) {
      tbody.insertBefore(tr, tbody.firstChild);
    } else {
      tbody.appendChild(tr);
    }

    // Remove animation class after it plays
    setTimeout(() => tr.classList.remove('new-row'), 700);

    // Cap DOM rows at 500
    while (tbody.rows.length > 500) tbody.deleteRow(tbody.rows.length - 1);

    // Toggle empty state
    document.getElementById('log-empty').classList.toggle('visible', tbody.rows.length === 0);
  }

  function rebuildLogTable() {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    const visible = state.filter === 'all'
      ? state.events
      : state.events.filter(e => e.category === state.filter);
    visible.slice(0, 500).forEach(e => renderLogRow(e, false));
    document.getElementById('log-empty').classList.toggle('visible', tbody.rows.length === 0);
    updateFilterCount();
  }

  function updateFilterCount() {
    const total   = state.events.length;
    const visible = state.filter === 'all' ? total : state.events.filter(e => e.category === state.filter).length;
    document.getElementById('filter-count').textContent = `${visible} / ${total} events`;
  }


  // ─────────────────────────────────────────────────────────────────
  // MOCK TRAFFIC GENERATION (browser dev mode)
  // ─────────────────────────────────────────────────────────────────

  function mockRequest(catId, url, mode) {

    // Weighted outcome — [ok, blocked, wrn, err, challenge]
    // AI / news lean into CF challenges since many of those sites use Cloudflare
    const weights = {
      ai:        [45, 30, 5, 5, 15],
      social:    [30, 55, 5, 10, 0],
      im:        [40, 45, 5, 10, 0],
      video:     [35, 55, 5, 5,  0],
      news:      [45, 40, 5, 5,  5],
      malicious: [10, 75, 5, 10, 0],
    };
    const w = weights[catId] || [50, 35, 5, 10, 0];
    const roll = Math.random() * 100;
    let outcome, code, response;
    let acc = 0;

    if (roll < (acc += w[0])) {
      outcome = 'ok'; code = 200; response = '';
    } else if (roll < (acc += w[1])) {
      outcome = 'blocked'; code = 403; response = '403 Forbidden';
    } else if (roll < (acc += w[2])) {
      outcome = 'wrn'; code = 301; response = '301 Redirect';
    } else if (roll < (acc += w[3])) {
      outcome = 'err'; code = 0;
      response = randomItem(['ConnectError: [Errno -3] Temp...', 'SSLError: cert verify failed', '400 Bad Request', 'Connection refused']);
    } else {
      outcome = 'challenge'; code = 403; response = 'CF Challenge (403)';
    }

    const txBytes = Math.floor(Math.random() * 800) + 80;
    // Stream-mode successes move a lot more data since the window holds open
    let rxBytes;
    if (outcome === 'ok' && mode === 'stream') {
      rxBytes = Math.floor(Math.random() * 4_000_000) + 2_000_000;   // ~2–6 MB
    } else if (outcome === 'ok') {
      rxBytes = Math.floor(Math.random() * 200000) + 5000;
    } else {
      rxBytes = Math.floor(Math.random() * 8000) + 1000;
    }

    return { url, mode, outcome, code, response, txBytes, rxBytes };
  }

  // ─────────────────────────────────────────────────────────────────
  // REAL TRAFFIC (Electron mode)
  // ─────────────────────────────────────────────────────────────────

  async function realRequest(catId, url, mode) {
    const cat = state.config.categories[catId];
    const { timeout, blockSignatures } = state.config.settings;

    let result;
    if (mode === 'stream' || mode === 'browser') {
      // Both BROWSER and STREAM run inside the category's <webview> tile —
      // single source of truth, byte counts come from the session hook in main.
      result = await webviewRequest(catId, url, mode, {
        streamDuration: cat.streamDuration || 15,
        crawlDepth: state.config.settings.crawlDepth || 1,
        blockSignatures,
      });
    } else {
      result = await window.electronAPI.makeHttpRequest({ url, timeout, blockSignatures });
    }

    let outcome, response;
    if (result.error && !result.status) {
      outcome = 'err';
      response = result.statusText || result.error || 'Connection error';
    } else if (result.challenge) {
      outcome = 'challenge';
      response = result.status ? `CF Challenge (${result.status})` : 'CF Challenge';
    } else if (result.blocked) {
      outcome = 'blocked';
      // A 2xx + blocked means the block page was served with a success status
      // (typical for browser-mode / SSL-inspected block pages). Make that clear
      // so the row doesn't look like "BLOCKED · 200 · 200 OK" which reads wrong.
      if (result.status >= 200 && result.status < 300) {
        response = `Block page served (HTTP ${result.status})`;
      } else {
        response = `${result.status} ${result.statusText}`;
      }
    } else if (result.status >= 400) {
      outcome = result.status >= 500 ? 'err' : 'wrn';
      response = `${result.status} ${result.statusText}`;
    } else {
      outcome = 'ok';
      response = '';
    }

    return { url, mode, outcome, code: result.status || 0, response, txBytes: result.txBytes || 0, rxBytes: result.rxBytes || 0 };
  }

  // ─────────────────────────────────────────────────────────────────
  // TRAFFIC ENGINE — per-category scheduling
  // ─────────────────────────────────────────────────────────────────

  // How long to wait before the NEXT request fires for this category. HTTP
  // mode honours the SLOW/MED/FAST speed toggle; BROWSER and STREAM are
  // naturally paced by their own work (page load + crawl, or the stream
  // hold) so we use a small fixed gap instead of compounding with speed.
  function nextDelay(cat) {
    if (cat.mode === 'http') {
      return (SPEEDS[cat.speed] || SPEEDS.slow) + Math.random() * 1000;
    }
    return 400 + Math.random() * 400;
  }

  function scheduleNext(catId, immediate = false) {
    if (!state.running) return;
    const cat = state.config.categories[catId];
    if (!cat || !cat.enabled) return;

    // First fire after START is nearly immediate (tiny jitter so all enabled
    // categories don't hit the exact same millisecond). Subsequent fires
    // use the mode-aware delay.
    const delay = immediate ? Math.random() * 250 : nextDelay(cat);

    state.timers[catId] = setTimeout(async () => {
      if (!state.running || !cat.enabled) return;

      const entry = randomItem(cat.urls) || '';
      const url   = urlOf(entry);
      const mode  = isStream(entry) ? 'stream' : resolveMode(catId);

      let result;
      if (IS_ELECTRON) {
        try { result = await realRequest(catId, url, mode); } catch (e) {
          result = { url, mode, outcome: 'err', code: 0, response: String(e.message).slice(0, 60), txBytes: 0, rxBytes: 0 };
        }
      } else {
        result = mockRequest(catId, url, mode);
        await new Promise(r => setTimeout(r, Math.random() * 400 + 100));
      }

      const evt = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        timeStr: fmtTime(new Date()),
        category: catId,
        ...result,
      };

      addLogEvent(evt);
      scheduleNext(catId, false);
    }, delay);
  }

  function startTraffic() {
    state.running = true;
    state.startTime = state.startTime || Date.now();
    // All enabled categories fire their first request immediately, then each
    // chain continues at its own pace.
    Object.keys(state.config.categories).forEach(k => {
      if (state.config.categories[k].enabled) scheduleNext(k, true);
    });
  }

  function stopTraffic() {
    state.running = false;
    Object.values(state.timers).forEach(t => clearTimeout(t));
    state.timers = {};

    // Kill every tile webview: blank the src to stop audio + cancel any
    // in-flight load, clear the URL label. Any in-flight navigateWebview
    // promises will fire did-fail-load (code -3 ERR_ABORTED) and resolve
    // cleanly; stream holds + crawl loops poll state.running so they exit.
    document.querySelectorAll('.preview-webview').forEach(wv => {
      try {
        if (typeof wv.stop === 'function') wv.stop();
        wv.src = 'about:blank';
      } catch (_) {}
    });
    document.querySelectorAll('.preview-url').forEach(u => { u.textContent = '—'; });
  }

  // ─────────────────────────────────────────────────────────────────
  // ATTACK SIMULATION
  // ─────────────────────────────────────────────────────────────────

  // Append a row to the attack-overlay mini log
  function appendMiniLogRow(evt) {
    const container = document.getElementById('attack-minilog');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'aml-row';
    const labelByType = { scan: 'PORT SCAN', eicar: 'EICAR', c2: 'C2 / MALWARE' };
    const prefix = labelByType[evt.vectorType] || 'ATTACK';
    row.innerHTML = `
      <span class="aml-time">${evt.timeStr}</span>
      <span class="aml-status ${outcomeClass(evt.outcome)}">${statusLabel(evt.outcome)}</span>
      <span class="aml-desc">${prefix}: ${evt.description || evt.url} ${evt.response ? ' — ' + evt.response : ''}</span>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  // Show the pre-launch configuration panel
  function showAttackPrelaunch() {
    renderOverlayToggles();
    const atk = state.config.settings.attack;
    document.getElementById('overlay-scan-target').value = atk.portScan.target || '8.8.8.8';

    document.getElementById('attack-prelaunch').classList.remove('hidden');
    document.getElementById('attack-running').classList.add('hidden');
    document.getElementById('attack-overlay').classList.remove('hidden');
  }

  // Render the toggle grid inside the overlay pre-launch panel
  function renderOverlayToggles() {
    const container = document.getElementById('overlay-attack-toggles');
    if (!container) return;
    container.innerHTML = '';
    const atk = state.config.settings.attack;

    ATTACK_VECTORS.forEach(v => {
      const cfg = atk[v.key];
      const enabled = cfg.enabled;

      const item = document.createElement('div');
      item.className = `overlay-toggle-item ${enabled ? 'enabled' : ''}`;
      item.dataset.key = v.key;

      const toggle = document.createElement('button');
      toggle.className = `cfg-cat-toggle ${enabled ? 'on' : ''}`;
      toggle.style.color = 'var(--cat-attack)';

      const textWrap = document.createElement('div');
      textWrap.className = 'overlay-toggle-text';

      const labelEl = document.createElement('span');
      labelEl.className = 'overlay-toggle-label';
      labelEl.textContent = v.label;

      const descEl = document.createElement('div');
      descEl.className = 'overlay-toggle-desc';
      descEl.textContent = v.desc;

      textWrap.appendChild(labelEl);
      textWrap.appendChild(descEl);
      item.appendChild(toggle);
      item.appendChild(textWrap);
      container.appendChild(item);

      // Toggle on click of either the button or the whole item
      const doToggle = () => {
        cfg.enabled = !cfg.enabled;
        toggle.className = `cfg-cat-toggle ${cfg.enabled ? 'on' : ''}`;
        item.classList.toggle('enabled', cfg.enabled);
        saveConfig();
      };
      toggle.addEventListener('click', e => { e.stopPropagation(); doToggle(); });
      item.addEventListener('click', doToggle);
    });
  }

  // Transition overlay from pre-launch → running and execute the sequence
  async function runAttack() {
    if (state.attackRunning) return;
    state.attackRunning = true;
    state.attackAborted = false;

    // Read scan target from overlay input before switching panels
    const scanTargetEl = document.getElementById('overlay-scan-target');
    if (scanTargetEl) {
      state.config.settings.attack.portScan.target = scanTargetEl.value.trim() || '8.8.8.8';
      saveConfig();
    }

    // Switch to running panel
    document.getElementById('attack-prelaunch').classList.add('hidden');
    document.getElementById('attack-running').classList.remove('hidden');
    document.getElementById('atk-sent').textContent = '0';
    document.getElementById('atk-blk').textContent  = '0';
    document.getElementById('atk-ok').textContent   = '0';
    document.getElementById('attack-phase').textContent = 'Initialising attack vectors...';
    document.getElementById('attack-progress-bar').style.width = '0%';
    document.getElementById('status-dot').className = 'status-dot attack';

    const minilog = document.getElementById('attack-minilog');
    if (minilog) minilog.innerHTML = '';

    // Pause normal traffic
    const wasRunning = state.running;
    if (wasRunning) stopTraffic();

    const attackStart = Date.now();
    const attackEvents = [];
    const sequence = buildAttackSequence();
    const total = sequence.length;
    let sent = 0, blk = 0, ok = 0;

    for (let i = 0; i < total; i++) {
      if (state.attackAborted) break;

      const step = sequence[i];
      document.getElementById('attack-phase').textContent = step.phase;
      document.getElementById('attack-progress-bar').style.width = `${(i / total) * 100}%`;

      await sleep(900 + Math.random() * 800);
      if (state.attackAborted) break;

      let outcome, code, response, txBytes, rxBytes;

      if (step.type === 'scan') {
        if (IS_ELECTRON) {
          const host = state.config.settings.attack.portScan.target || '8.8.8.8';
          const results = await window.electronAPI.portScan({ host, ports: step.ports });
          const open = results.filter(r => r.open);
          // Closed ports alone aren't evidence of SASE blocking — could just be a
          // host with those services not running. Report as WRN (attempt completed,
          // nothing open) rather than BLOCKED, which implies active filtering.
          outcome = open.length > 0 ? 'wrn' : 'wrn';
          code = 0;
          response = open.length > 0
            ? `Ports open: ${open.map(r => r.port).join(', ')}`
            : `All ports closed/filtered on ${host}`;
        } else {
          outcome = 'wrn';
          code = 0;
          response = Math.random() > 0.7
            ? `Ports open: ${randomItem(step.ports || [])}`
            : `All ports closed/filtered`;
        }
        txBytes = 200; rxBytes = 60;
      } else {
        if (IS_ELECTRON) {
          try {
            const res = await window.electronAPI.makeHttpRequest({ url: step.url, timeout: 8, blockSignatures: state.config.settings.blockSignatures });
            if (res.error && !res.status) { outcome = 'err'; code = 0; response = res.statusText; }
            else if (res.blocked) { outcome = 'blocked'; code = res.status; response = `${res.status} ${res.statusText}`; }
            else if (res.status >= 400) { outcome = 'err'; code = res.status; response = `${res.status} ${res.statusText}`; }
            else { outcome = 'ok'; code = res.status; response = ''; }
            txBytes = res.txBytes || 200; rxBytes = res.rxBytes || 1000;
          } catch (e) {
            outcome = 'err'; code = 0; response = String(e.message).slice(0, 60); txBytes = 0; rxBytes = 0;
          }
        } else {
          const roll = Math.random();
          outcome = roll < 0.75 ? 'blocked' : (roll < 0.88 ? 'err' : 'ok');
          code = outcome === 'blocked' ? 403 : (outcome === 'err' ? 0 : 200);
          response = outcome === 'blocked' ? '403 Forbidden' : (outcome === 'err' ? 'ConnectError: connection refused' : '');
          txBytes = Math.floor(Math.random() * 400) + 100;
          rxBytes = outcome === 'blocked' ? Math.floor(Math.random() * 8000) + 2000 : Math.floor(Math.random() * 2000);
        }
      }

      sent++;
      if (outcome === 'ok') ok++;
      else if (outcome === 'blocked') blk++;

      document.getElementById('atk-sent').textContent = sent;
      document.getElementById('atk-blk').textContent  = blk;
      document.getElementById('atk-ok').textContent   = ok;

      const evt = {
        id: `atk-${Date.now()}-${i}`,
        ts: Date.now(),
        timeStr: fmtTime(new Date()),
        category: 'malicious',
        url: step.url,
        mode: 'http',
        outcome, code,
        response: response || step.desc,
        txBytes, rxBytes,
        vectorType: step.type,        // 'scan' | 'eicar' | 'c2'
        description: step.desc,
      };
      attackEvents.push(evt);
      addLogEvent(evt);
      appendMiniLogRow(evt);
    }

    document.getElementById('attack-progress-bar').style.width = '100%';
    await sleep(900);

    // Archive this attack run for inclusion in the final report
    state.attackRuns.push({
      start:    attackStart,
      end:      Date.now(),
      duration: Date.now() - attackStart,
      events:   attackEvents,
      aborted:  state.attackAborted,
    });

    state.attackRunning = false;
    document.getElementById('attack-overlay').classList.add('hidden');

    if (wasRunning && !state.attackAborted) {
      startTraffic();
      document.getElementById('status-dot').className = 'status-dot running';
    } else {
      document.getElementById('status-dot').className = state.running ? 'status-dot running' : 'status-dot';
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ─────────────────────────────────────────────────────────────────
  // UI — TOP BAR LIVE STATS
  // ─────────────────────────────────────────────────────────────────

  function updateTopBarLive() {
    pruneRecentBytes();

    // Rate (events/min over last 60s)
    const recent60 = getWindowedRate(60000);
    const rate = recent60.length / 1.0;  // events in last 60s, scaled to /min
    document.getElementById('rate-display').textContent = rate.toFixed(1) + '/min';

    // Bandwidth (bytes/sec over last 5s)
    const recent5 = getWindowedRate(5000);
    const txRate = recent5.reduce((a, b) => a + b.tx, 0) / 5;
    const rxRate = recent5.reduce((a, b) => a + b.rx, 0) / 5;
    document.getElementById('tx-rate').textContent = fmtBytes(txRate) + '/s';
    document.getElementById('rx-rate').textContent = fmtBytes(rxRate) + '/s';

    // Totals
    const tot = totalStats();
    document.getElementById('total-count').textContent = tot.sent;
    document.getElementById('total-tx').textContent = fmtBytes(tot.txBytes);
    document.getElementById('total-rx').textContent = fmtBytes(tot.rxBytes);
  }

  function startUptimeTick() {
    state.uptimeTimer = setInterval(() => {
      if (!state.startTime) return;
      document.getElementById('uptime').textContent = fmtUptime(Date.now() - state.startTime);
      updateTopBarLive();
    }, 1000);
  }

  // ─────────────────────────────────────────────────────────────────
  // UI — CATEGORY PILLS (configbar)
  // ─────────────────────────────────────────────────────────────────

  // (pills removed — category enable/disable now lives inside each stat card)

  // ─────────────────────────────────────────────────────────────────
  // UI — CONFIG PANEL CATEGORIES
  // ─────────────────────────────────────────────────────────────────

  function renderConfigCategories() {
    const container = document.getElementById('config-categories');
    container.innerHTML = '';

    Object.values(state.config.categories).forEach(cat => {
      const row = document.createElement('div');
      row.className = 'cfg-cat-row';

      // Enable/disable toggle — synchronised with the scard toggle via setCategoryEnabled
      const toggle = document.createElement('button');
      toggle.className = `cfg-cat-toggle ${cat.enabled ? 'on' : ''}`;
      toggle.style.color = `var(${cat.cssVar})`;
      toggle.dataset.catId = cat.id;
      toggle.title = cat.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
      toggle.addEventListener('click', () => setCategoryEnabled(cat.id, !cat.enabled));

      // Category name
      const name = document.createElement('span');
      name.className = 'cfg-cat-name';
      name.style.color = `var(${cat.cssVar})`;
      name.textContent = cat.label;

      // Speed buttons: SLOW | MED | FAST
      const speedGroup = document.createElement('div');
      speedGroup.className = 'cfg-speed-group';
      ['slow', 'medium', 'fast'].forEach(sp => {
        const btn = document.createElement('button');
        btn.className = 'cfg-speed-btn';
        btn.textContent = sp === 'medium' ? 'MED' : sp.toUpperCase().slice(0, 4);
        btn.dataset.speed = sp;
        setBtnActive(btn, cat.speed === sp, cat.cssVar);
        btn.addEventListener('click', () => {
          cat.speed = sp;
          speedGroup.querySelectorAll('.cfg-speed-btn').forEach(b =>
            setBtnActive(b, b.dataset.speed === sp, cat.cssVar));
          if (state.running && cat.enabled) {
            clearTimeout(state.timers[cat.id]);
            scheduleNext(cat.id);
          }
          saveConfig();
        });
        speedGroup.appendChild(btn);
      });

      // Mode buttons: HTTP | BROWSER | MIX
      const modeGroup = document.createElement('div');
      modeGroup.className = 'cfg-speed-group';
      modeGroup.style.marginLeft = '8px';
      [['http','HTTP'], ['browser','BROWSER'], ['mixed','MIX']].forEach(([val, label]) => {
        const btn = document.createElement('button');
        btn.className = 'cfg-mode-btn';
        btn.textContent = label;
        btn.dataset.mode = val;
        setBtnActive(btn, cat.mode === val, cat.cssVar);
        btn.addEventListener('click', () => {
          cat.mode = val;
          modeGroup.querySelectorAll('.cfg-mode-btn').forEach(b =>
            setBtnActive(b, b.dataset.mode === val, cat.cssVar));
          saveConfig();
        });
        modeGroup.appendChild(btn);
      });

      // URL count shortcut
      const urlCount = document.createElement('span');
      urlCount.className = 'cfg-url-count';
      urlCount.textContent = `${cat.urls.length} urls ⚙`;
      urlCount.addEventListener('click', () => openUrlEditor(cat.id));

      row.appendChild(toggle);
      row.appendChild(name);
      row.appendChild(speedGroup);
      row.appendChild(modeGroup);
      row.appendChild(urlCount);
      container.appendChild(row);
    });

    // ─── Bulk-action row — same layout, but clicking applies to every category
    const allRow = document.createElement('div');
    allRow.className = 'cfg-cat-row cfg-cat-row-all';

    // Invisible toggle-sized spacer so the name/speed/mode columns line up
    const tSpacer = document.createElement('span');
    tSpacer.style.cssText = 'width:28px;flex-shrink:0;';
    allRow.appendChild(tSpacer);

    const allName = document.createElement('span');
    allName.className = 'cfg-cat-name';
    allName.textContent = 'APPLY TO ALL';
    allRow.appendChild(allName);

    const allSpeed = document.createElement('div');
    allSpeed.className = 'cfg-speed-group';
    ['slow', 'medium', 'fast'].forEach(sp => {
      const btn = document.createElement('button');
      btn.className = 'cfg-speed-btn';
      btn.textContent = sp === 'medium' ? 'MED' : sp.toUpperCase().slice(0, 4);
      btn.title = `Set every category to ${sp.toUpperCase()}`;
      btn.addEventListener('click', () => setAllSpeeds(sp));
      allSpeed.appendChild(btn);
    });
    allRow.appendChild(allSpeed);

    const allMode = document.createElement('div');
    allMode.className = 'cfg-speed-group';
    allMode.style.marginLeft = '8px';
    [['http','HTTP'], ['browser','BROWSER'], ['mixed','MIX']].forEach(([val, label]) => {
      const btn = document.createElement('button');
      btn.className = 'cfg-mode-btn';
      btn.textContent = label;
      btn.title = `Set every category to ${label}`;
      btn.addEventListener('click', () => setAllModes(val));
      allMode.appendChild(btn);
    });
    allRow.appendChild(allMode);

    // Right-side spacer for column alignment
    const rSpacer = document.createElement('span');
    rSpacer.className = 'cfg-url-count';
    rSpacer.style.visibility = 'hidden';
    rSpacer.textContent = '000 urls';
    allRow.appendChild(rSpacer);

    container.appendChild(allRow);
  }

  function renderBlockSigTags() {
    const container = document.getElementById('sig-tags');
    container.innerHTML = '';
    state.config.settings.blockSignatures.forEach((sig, i) => {
      const tag = document.createElement('div');
      tag.className = 'sig-tag';
      tag.innerHTML = `<span>${sig}</span><button class="sig-tag-del" data-i="${i}">×</button>`;
      tag.querySelector('.sig-tag-del').addEventListener('click', () => {
        state.config.settings.blockSignatures.splice(i, 1);
        renderBlockSigTags();
        saveConfig();
      });
      container.appendChild(tag);
    });
  }

  // (overlay toggles rendered inline in showAttackPrelaunch / renderOverlayToggles)

  // ─────────────────────────────────────────────────────────────────
  // UI — STATS CARDS
  // ─────────────────────────────────────────────────────────────────

  function renderStatsCards() {
    const container = document.getElementById('stats-cards');
    container.innerHTML = '';

    const cats = Object.values(state.config.categories);
    cats.push({ id: 'totals', label: 'TOTALS', cssVar: '--text-bright', short: 'TOTALS' });

    cats.forEach(cat => {
      const isTotals = cat.id === 'totals';
      const enabled  = isTotals ? true : cat.enabled;

      const card = document.createElement('div');
      card.className = `scard ${isTotals ? 'totals' : ''} ${!enabled ? 'disabled' : ''}`;
      card.id = `scard-${cat.id}`;

      const toggleHtml = isTotals ? '' :
        `<span class="scard-toggle ${enabled ? 'on' : ''}" style="color:var(${cat.cssVar})" aria-hidden="true"></span>`;

      // TOTALS card has an empty hidden title row — its heading lives inside the body
      const bodyHeading = isTotals ? `<span class="totals-heading">TOTALS</span>` : '';

      // Non-totals title is a <button> so the whole toggle+name is a single label target
      const titleOpen  = isTotals ? `<div class="scard-title">` : `<button type="button" class="scard-title scard-title-btn" data-cat-id="${cat.id}" title="Click to toggle ${cat.label}">`;
      const titleClose = isTotals ? `</div>` : `</button>`;

      card.innerHTML = `
        ${titleOpen}
          ${toggleHtml}
          <span class="scard-title-text" style="color:var(${cat.cssVar})">${cat.label || cat.id.toUpperCase()}</span>
        ${titleClose}
        <div class="scard-body">
          ${bodyHeading}
          <span class="sb-label">SENT</span><span class="sb-val" id="sc-${cat.id}-sent">0</span>
          <span class="sb-label">OK</span><span class="sb-val ok" id="sc-${cat.id}-ok">0</span>
          <span class="sb-label">BLK</span><span class="sb-val blocked" id="sc-${cat.id}-blk">0</span>
          <span class="sb-label">CHA</span><span class="sb-val challenge" id="sc-${cat.id}-cha">0</span>
          <span class="sb-label">WRN</span><span class="sb-val wrn" id="sc-${cat.id}-wrn">0</span>
          <span class="sb-label">ERR</span><span class="sb-val err" id="sc-${cat.id}-err">0</span>
        </div>
        <div class="scard-footer">
          <span class="sb-label">↑ TX</span><span class="sb-val dim" id="sc-${cat.id}-tx">0B</span>
          <span class="sb-label">↓ RX</span><span class="sb-val dim" id="sc-${cat.id}-rx">0B</span>
        </div>
      `;
      container.appendChild(card);
    });

    // Wire clicks on the title row — the whole toggle + name area is one label
    container.querySelectorAll('.scard-title-btn').forEach(el => {
      el.addEventListener('click', () => setCategoryEnabled(el.dataset.catId, !state.config.categories[el.dataset.catId].enabled));
    });
  }

  // Single source of truth for enabling/disabling a category. Keeps the
  // in-card toggle + the config-panel toggle in sync and handles the timer.
  function setCategoryEnabled(catId, enabled) {
    const cat = state.config.categories[catId];
    if (!cat || cat.enabled === enabled) return;
    cat.enabled = enabled;

    // Update in-card toggle visual (now nested inside the title button)
    const titleBtn = document.querySelector(`.scard-title-btn[data-cat-id="${catId}"]`);
    if (titleBtn) {
      const tog = titleBtn.querySelector('.scard-toggle');
      if (tog) tog.classList.toggle('on', enabled);
      titleBtn.title = `Click to ${enabled ? 'disable' : 'enable'} ${state.config.categories[catId].label}`;
    }
    const card = document.getElementById(`scard-${catId}`);
    if (card) card.classList.toggle('disabled', !enabled);

    // Update config-panel toggle
    document.querySelectorAll(`.cfg-cat-toggle[data-cat-id="${catId}"]`).forEach(el => {
      el.classList.toggle('on', enabled);
      el.title = enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
    });

    // Traffic scheduling
    if (state.running) {
      if (enabled) scheduleNext(catId);
      else { clearTimeout(state.timers[catId]); delete state.timers[catId]; }
    }
    saveConfig();
  }

  function updateStatsCards() {
    Object.keys(state.stats).forEach(catId => {
      const s = state.stats[catId];
      const setVal = (suffix, val) => {
        const el = document.getElementById(`sc-${catId}-${suffix}`);
        if (el) el.textContent = val;
      };
      setVal('sent', s.sent);
      setVal('ok',   s.ok);
      setVal('cha',  s.cha || 0);
      setVal('wrn',  s.wrn);
      setVal('blk',  s.blk);
      setVal('err',  s.err);
      setVal('tx',   fmtBytes(s.txBytes));
      setVal('rx',   fmtBytes(s.rxBytes));
    });

    // Totals card
    const tot = totalStats();
    ['sent','ok','cha','wrn','blk','err'].forEach(k => {
      const el = document.getElementById(`sc-totals-${k}`);
      if (el) el.textContent = tot[k];
    });
    const txEl = document.getElementById('sc-totals-tx');
    const rxEl = document.getElementById('sc-totals-rx');
    if (txEl) txEl.textContent = fmtBytes(tot.txBytes);
    if (rxEl) rxEl.textContent = fmtBytes(tot.rxBytes);
  }

  // ─────────────────────────────────────────────────────────────────
  // URL EDITOR MODAL (cog)
  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  // URL EDITOR MODAL — tabbed (traffic categories + attack)
  // ─────────────────────────────────────────────────────────────────

  let urlEditorActiveTab = null;

  function openUrlEditor(focusCatId) {
    const tabBar = document.getElementById('url-modal-tabs');
    tabBar.innerHTML = '';

    // Build tab list: one per traffic category + ATTACK
    const tabs = [
      ...Object.values(state.config.categories).map(c => ({ id: c.id, label: c.short, color: `var(${c.cssVar})`, attack: false })),
      { id: 'attack', label: '⚡ ATTACK', color: 'var(--cat-attack)', attack: true },
    ];

    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = `url-mtab ${t.attack ? 'attack' : ''}`;
      btn.textContent = t.label;
      btn.style.setProperty('--tab-color', t.color);
      btn.dataset.tabId = t.id;
      btn.addEventListener('click', () => switchUrlTab(t.id));
      tabBar.appendChild(btn);
    });

    const startTab = focusCatId || urlEditorActiveTab || Object.keys(state.config.categories)[0];
    switchUrlTab(startTab);

    document.getElementById('url-modal-overlay').classList.remove('hidden');
  }

  function switchUrlTab(tabId) {
    urlEditorActiveTab = tabId;

    // Update tab active states
    document.querySelectorAll('.url-mtab').forEach(btn => {
      const active = btn.dataset.tabId === tabId;
      btn.classList.toggle('active', active);
      if (active) {
        const isAttack = btn.classList.contains('attack');
        btn.style.borderBottomColor = isAttack ? 'var(--cat-attack)' : '';
        // Color is handled by .active rule for traffic tabs
      }
    });

    const body = document.getElementById('url-modal-body');
    body.innerHTML = '';

    if (tabId === 'attack') {
      renderAttackUrlTab(body);
    } else {
      renderCategoryUrlTab(body, state.config.categories[tabId]);
    }
  }

  function renderCategoryUrlTab(body, cat) {
    if (!cat) return;
    const isVideoCat = cat.id === 'video';

    const header = document.createElement('div');
    header.className = 'url-cat-header';
    header.innerHTML = `
      <span class="url-cat-title" style="color:var(${cat.cssVar})">${cat.label}</span>
      <span class="url-cat-count" id="url-count-${cat.id}">${cat.urls.length} urls</span>
    `;
    body.appendChild(header);

    if (isVideoCat) {
      const hint = document.createElement('div');
      hint.className = 'url-cat-hint';
      hint.innerHTML = `Toggle <b>STREAM</b> on any URL to keep the hidden browser open for ${cat.streamDuration || 15}s so video actually auto-plays. Leave off for regular one-shot loads (landing pages, etc.).`;
      body.appendChild(hint);
    }

    const list = document.createElement('div');
    list.className = 'url-list';

    const renderUrls = () => {
      list.innerHTML = '';
      cat.urls.forEach((entry, idx) => {
        const url    = urlOf(entry);
        const streamOn = isStream(entry);

        const row = document.createElement('div');
        row.className = 'url-row';

        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'url-input'; inp.value = url; inp.placeholder = 'example.com/path';
        inp.addEventListener('change', () => {
          const val = inp.value.trim();
          if (typeof cat.urls[idx] === 'object' && cat.urls[idx] !== null) cat.urls[idx].url = val;
          else cat.urls[idx] = val;
        });
        row.appendChild(inp);

        if (isVideoCat) {
          const tog = document.createElement('button');
          tog.type = 'button';
          tog.className = `url-stream-toggle ${streamOn ? 'on' : ''}`;
          tog.innerHTML = `<span class="uss-dot"></span>STREAM`;
          tog.title = streamOn
            ? 'Streaming URL — browser stays open so video plays'
            : 'Regular URL — uses the category mode (HTTP/BROWSER/MIX)';
          tog.addEventListener('click', () => {
            // Promote string → object form on first stream toggle
            if (typeof cat.urls[idx] === 'string') cat.urls[idx] = { url: cat.urls[idx], stream: false };
            cat.urls[idx].stream = !cat.urls[idx].stream;
            tog.classList.toggle('on', cat.urls[idx].stream);
            tog.title = cat.urls[idx].stream
              ? 'Streaming URL — browser stays open so video plays'
              : 'Regular URL — uses the category mode (HTTP/BROWSER/MIX)';
          });
          row.appendChild(tog);
        }

        const del = document.createElement('button');
        del.className = 'url-del-btn'; del.textContent = '×';
        del.addEventListener('click', () => {
          cat.urls.splice(idx, 1);
          renderUrls();
          const countEl = document.getElementById(`url-count-${cat.id}`);
          if (countEl) countEl.textContent = `${cat.urls.length} urls`;
        });
        row.appendChild(del);
        list.appendChild(row);
      });
    };
    renderUrls();
    body.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'url-add-btn'; addBtn.textContent = '+ ADD URL';
    addBtn.addEventListener('click', () => {
      cat.urls.push(isVideoCat ? { url: '', stream: false } : '');
      renderUrls();
      const countEl = document.getElementById(`url-count-${cat.id}`);
      if (countEl) countEl.textContent = `${cat.urls.length} urls`;
      list.lastElementChild?.querySelector('input')?.focus();
    });
    body.appendChild(addBtn);
  }

  function renderAttackUrlTab(body) {
    const atk = state.config.settings.attack;

    // Ensure the attack config has the expected nested structure before rendering
    // (guards against stale localStorage from before the config format change)
    const defaults = DEFAULT_CONFIG.settings.attack;
    if (!atk || typeof atk.portScan !== 'object') {
      state.config.settings.attack = JSON.parse(JSON.stringify(defaults));
      saveConfig();
      renderAttackUrlTab(body);
      return;
    }
    if (!Array.isArray(atk.portScan.ports)) atk.portScan.ports = [...defaults.portScan.ports];

    // ── PORT SCAN ──────────────────────────────────────────────────
    const portSection = document.createElement('div');
    portSection.className = 'atk-url-section';
    portSection.innerHTML = `<div class="atk-url-section-title">PORT SCAN — target host &amp; port list</div>`;

    const targetRow = document.createElement('div');
    targetRow.className = 'cg-row';
    targetRow.style.marginBottom = '8px';
    targetRow.innerHTML = `<span class="cg-label">TARGET HOST</span>`;
    const targetInp = document.createElement('input');
    targetInp.type = 'text'; targetInp.className = 'atk-port-input'; targetInp.style.width = '140px';
    targetInp.value = atk.portScan.target || '8.8.8.8';
    targetInp.addEventListener('change', () => { atk.portScan.target = targetInp.value.trim() || '8.8.8.8'; saveConfig(); });
    targetRow.appendChild(targetInp);
    portSection.appendChild(targetRow);

    const portRow = document.createElement('div');
    portRow.className = 'atk-port-row';
    const renderPorts = () => {
      portRow.innerHTML = '';
      atk.portScan.ports.forEach((p, i) => {
        const chip = document.createElement('div');
        chip.className = 'atk-port-chip';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.className = 'atk-port-input'; inp.value = p;
        inp.addEventListener('change', () => { atk.portScan.ports[i] = parseInt(inp.value) || p; saveConfig(); });
        const del = document.createElement('button');
        del.className = 'url-del-btn'; del.textContent = '×';
        del.addEventListener('click', () => { atk.portScan.ports.splice(i, 1); renderPorts(); saveConfig(); });
        chip.appendChild(inp); chip.appendChild(del); portRow.appendChild(chip);
      });
      const addPort = document.createElement('button');
      addPort.className = 'url-add-btn'; addPort.textContent = '+ PORT';
      addPort.addEventListener('click', () => { atk.portScan.ports.push(80); renderPorts(); saveConfig(); });
      portRow.appendChild(addPort);
    };
    renderPorts();
    portSection.appendChild(portRow);
    body.appendChild(portSection);

    // ── URL-based vectors ──────────────────────────────────────────
    ATTACK_VECTORS.filter(v => !v.hasPorts).forEach(v => {
      const cfg = atk[v.key];
      if (!cfg || !Array.isArray(cfg.urls)) return; // skip if malformed

      const section = document.createElement('div');
      section.className = 'atk-url-section';
      section.innerHTML = `<div class="atk-url-section-title">${v.label} — ${v.desc}</div>`;

      const list = document.createElement('div');
      list.className = 'url-list';

      const renderUrls = () => {
        list.innerHTML = '';
        cfg.urls.forEach((url, idx) => {
          const row = document.createElement('div');
          row.className = 'url-row';
          const inp = document.createElement('input');
          inp.type = 'text'; inp.className = 'url-input'; inp.value = url; inp.placeholder = 'example.com/path';
          inp.addEventListener('change', () => { cfg.urls[idx] = inp.value.trim(); });
          const del = document.createElement('button');
          del.className = 'url-del-btn'; del.textContent = '×';
          del.addEventListener('click', () => { cfg.urls.splice(idx, 1); renderUrls(); saveConfig(); });
          row.appendChild(inp); row.appendChild(del); list.appendChild(row);
        });
      };
      renderUrls();
      section.appendChild(list);

      const addBtn = document.createElement('button');
      addBtn.className = 'url-add-btn'; addBtn.textContent = '+ ADD URL';
      addBtn.addEventListener('click', () => {
        cfg.urls.push('');
        renderUrls();
        list.lastElementChild?.querySelector('input')?.focus();
      });
      section.appendChild(addBtn);
      body.appendChild(section);
    });
  }

  function closeUrlEditor() {
    Object.values(state.config.categories).forEach(cat => {
      cat.urls = cat.urls.filter(u => urlOf(u).trim().length > 0);
    });
    Object.keys(state.config.settings.attack).forEach(k => {
      const v = state.config.settings.attack[k];
      if (v.urls) v.urls = v.urls.filter(u => u.trim().length > 0);
    });
    renderConfigCategories();
    renderStatsCards();
    updateStatsCards();
    saveConfig();
    document.getElementById('url-modal-overlay').classList.add('hidden');
  }

  // ─────────────────────────────────────────────────────────────────
  // REPORT GENERATION
  // ─────────────────────────────────────────────────────────────────

  function buildReport() {
    const tot  = totalStats();
    const dur  = state.startTime ? fmtUptime(Date.now() - state.startTime) : '—';
    const date = new Date().toLocaleString();

    const catRows = Object.values(state.config.categories).map(cat => {
      const s = state.stats[cat.id] || {};
      return `
        <div class="report-card">
          <div class="report-card-title" style="color:${getComputedStyle(document.documentElement).getPropertyValue(cat.cssVar).trim()}">${cat.label}</div>
          <div class="report-stat-row"><span>Sent</span><span class="report-stat-val">${s.sent||0}</span></div>
          <div class="report-stat-row"><span>OK</span><span class="report-stat-val" style="color:var(--ok)">${s.ok||0}</span></div>
          <div class="report-stat-row"><span>Blocked</span><span class="report-stat-val" style="color:var(--blocked)">${s.blk||0}</span></div>
          <div class="report-stat-row"><span>Challenges</span><span class="report-stat-val" style="color:var(--challenge)">${s.cha||0}</span></div>
          <div class="report-stat-row"><span>Warning</span><span class="report-stat-val" style="color:var(--wrn)">${s.wrn||0}</span></div>
          <div class="report-stat-row"><span>Error</span><span class="report-stat-val" style="color:var(--err)">${s.err||0}</span></div>
          <div class="report-stat-row"><span>TX</span><span class="report-stat-val">${fmtBytes(s.txBytes||0)}</span></div>
          <div class="report-stat-row"><span>RX</span><span class="report-stat-val">${fmtBytes(s.rxBytes||0)}</span></div>
        </div>`;
    }).join('');

    const blockRate = tot.sent > 0 ? ((tot.blk / tot.sent) * 100).toFixed(1) : '0.0';
    const passRate  = tot.sent > 0 ? ((tot.ok  / tot.sent) * 100).toFixed(1) : '0.0';

    document.getElementById('report-body').innerHTML = `
      <div class="report-content">
        <div class="report-section">
          <h3>SUMMARY</h3>
          <div class="report-stat-row"><span>Generated</span><span class="report-stat-val">${date}</span></div>
          <div class="report-stat-row"><span>Duration</span><span class="report-stat-val">${dur}</span></div>
          <div class="report-stat-row"><span>Total Attempts</span><span class="report-stat-val">${tot.sent}</span></div>
          <div class="report-stat-row"><span>Passed</span><span class="report-stat-val" style="color:var(--ok)">${tot.ok} (${passRate}%)</span></div>
          <div class="report-stat-row"><span>Blocked</span><span class="report-stat-val" style="color:var(--blocked)">${tot.blk} (${blockRate}%)</span></div>
          <div class="report-stat-row"><span>Challenges</span><span class="report-stat-val" style="color:var(--challenge)">${tot.cha || 0}</span></div>
          <div class="report-stat-row"><span>Warnings</span><span class="report-stat-val" style="color:var(--wrn)">${tot.wrn}</span></div>
          <div class="report-stat-row"><span>Errors</span><span class="report-stat-val" style="color:var(--err)">${tot.err}</span></div>
          <div class="report-stat-row"><span>Total TX</span><span class="report-stat-val">${fmtBytes(tot.txBytes)}</span></div>
          <div class="report-stat-row"><span>Total RX</span><span class="report-stat-val">${fmtBytes(tot.rxBytes)}</span></div>
        </div>
        <div class="report-section">
          <h3>BY CATEGORY</h3>
          <div class="report-grid">${catRows}</div>
        </div>
        ${renderAttackReportSection()}

        <div class="report-section">
          <h3>MODE</h3>
          <div class="report-stat-row"><span>Running in</span><span class="report-stat-val">${IS_ELECTRON ? 'Electron (real traffic)' : 'Browser (mock mode)'}</span></div>
          <div class="report-stat-row"><span>Build</span><span class="report-stat-val">v${BUILD_INFO.version} · ${BUILD_INFO.commit}</span></div>
        </div>
      </div>
    `;
  }

  // ATTACK SIMULATIONS section for the in-app report modal
  function renderAttackReportSection() {
    if (!state.attackRuns.length) return '';

    const runs = state.attackRuns.map((run, idx) => {
      const counts = { ok: 0, blk: 0, cha: 0, wrn: 0, err: 0 };
      run.events.forEach(e => {
        if (e.outcome === 'ok')        counts.ok++;
        else if (e.outcome === 'blocked')   counts.blk++;
        else if (e.outcome === 'challenge') counts.cha++;
        else if (e.outcome === 'wrn')       counts.wrn++;
        else                                counts.err++;
      });
      const rows = run.events.map(e => `
        <div class="report-stat-row" style="font-size:10px">
          <span>${e.timeStr} · ${e.description || e.url}</span>
          <span class="report-stat-val" style="color:var(--${outcomeClass(e.outcome)})">${statusLabel(e.outcome)}${e.response ? ' — ' + e.response : ''}</span>
        </div>`).join('');
      return `
        <div style="margin-bottom:14px; padding:10px; background:var(--bg-surface); border:1px solid var(--border-dim)">
          <div style="font-weight:700; font-size:10px; letter-spacing:0.08em; color:var(--cat-attack); margin-bottom:6px">
            RUN ${idx + 1} — ${new Date(run.start).toLocaleTimeString()} · ${Math.round(run.duration / 1000)}s${run.aborted ? ' (ABORTED)' : ''}
          </div>
          <div class="report-stat-row"><span>Events</span><span class="report-stat-val">${run.events.length}</span></div>
          <div class="report-stat-row"><span>Passed</span><span class="report-stat-val" style="color:var(--ok)">${counts.ok}</span></div>
          <div class="report-stat-row"><span>Blocked</span><span class="report-stat-val" style="color:var(--blocked)">${counts.blk}</span></div>
          <div class="report-stat-row"><span>Challenge</span><span class="report-stat-val" style="color:var(--challenge)">${counts.cha}</span></div>
          <div class="report-stat-row"><span>Warnings</span><span class="report-stat-val" style="color:var(--wrn)">${counts.wrn}</span></div>
          <div class="report-stat-row"><span>Errors</span><span class="report-stat-val" style="color:var(--err)">${counts.err}</span></div>
          <div style="margin-top:8px; padding-top:6px; border-top:1px solid var(--border-dim)">${rows}</div>
        </div>`;
    }).join('');

    return `
      <div class="report-section">
        <h3>⚡ ATTACK SIMULATIONS (${state.attackRuns.length})</h3>
        ${runs}
      </div>`;
  }

  function generateHtmlReport() {
    const tot  = totalStats();
    const dur  = state.startTime ? fmtUptime(Date.now() - state.startTime) : '—';
    const date = new Date().toLocaleString();
    const blockRate = tot.sent > 0 ? ((tot.blk / tot.sent) * 100).toFixed(1) : '0.0';
    const passRate  = tot.sent > 0 ? ((tot.ok  / tot.sent) * 100).toFixed(1) : '0.0';

    const evtRows = state.events.slice(0, 1000).map(e => `
      <tr>
        <td>${e.timeStr}</td>
        <td>${state.config.categories[e.category]?.short || e.category.toUpperCase()}</td>
        <td class="${outcomeClass(e.outcome)}">${statusLabel(e.outcome)}</td>
        <td>${e.mode.toUpperCase()}</td>
        <td>${e.code || '—'}</td>
        <td>${e.url}</td>
        <td>${e.response || ''}</td>
      </tr>`).join('');

    const attackRunsHtml = state.attackRuns.length ? `
<h2>⚡ ATTACK SIMULATIONS (${state.attackRuns.length})</h2>
${state.attackRuns.map((run, idx) => {
  const counts = { ok: 0, blk: 0, cha: 0, wrn: 0, err: 0 };
  run.events.forEach(e => {
    if (e.outcome === 'ok') counts.ok++;
    else if (e.outcome === 'blocked') counts.blk++;
    else if (e.outcome === 'challenge') counts.cha++;
    else if (e.outcome === 'wrn') counts.wrn++;
    else counts.err++;
  });
  return `
<div class="atk-run">
  <div class="atk-run-title">RUN ${idx + 1} — ${new Date(run.start).toLocaleString()} · ${Math.round(run.duration/1000)}s${run.aborted ? ' (ABORTED)' : ''}</div>
  <div class="atk-summary">
    <span>Events: <b>${run.events.length}</b></span>
    <span class="ok">Passed: <b>${counts.ok}</b></span>
    <span class="blk">Blocked: <b>${counts.blk}</b></span>
    <span class="cha">Challenge: <b>${counts.cha}</b></span>
    <span class="wrn">Warnings: <b>${counts.wrn}</b></span>
    <span class="err">Errors: <b>${counts.err}</b></span>
  </div>
  <table class="atk-evts">
    <thead><tr><th>TIME</th><th>VECTOR</th><th>TARGET</th><th>STATUS</th><th>DETAIL</th></tr></thead>
    <tbody>
      ${run.events.map(e => `<tr>
        <td>${e.timeStr}</td>
        <td>${(e.vectorType || '').toUpperCase()}</td>
        <td>${e.description || e.url}</td>
        <td class="${outcomeClass(e.outcome)}">${statusLabel(e.outcome)}</td>
        <td>${e.response || ''}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
}).join('')}
` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>STG Report — ${date}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #0c0e12; color: #c8d0e0; padding: 24px; }
  h1 { font-size: 16px; letter-spacing: .15em; margin-bottom: 4px; color: #e8edf8; }
  h2 { font-size: 12px; letter-spacing: .1em; color: #5a6480; margin: 20px 0 8px; border-bottom: 1px solid #232840; padding-bottom: 4px; }
  .meta { font-size: 11px; color: #5a6480; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 20px; }
  .card { background: #111520; border: 1px solid #232840; padding: 10px 12px; }
  .card-title { font-size: 10px; font-weight: bold; letter-spacing: .06em; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; }
  .val { font-weight: 600; }
  .ok { color: #4ade80; } .blk, .blocked { color: #f87171; } .wrn { color: #fbbf24; } .err { color: #fb923c; } .cha, .challenge { color: #c084fc; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #111520; padding: 5px 8px; text-align: left; letter-spacing: .08em; font-size: 9px; color: #5a6480; }
  td { padding: 3px 8px; border-bottom: 1px solid #181c2a; }
  tr:hover td { background: #1e2335; }
  .atk-run { margin-bottom: 18px; padding: 12px 14px; background: #111520; border: 1px solid #252840; }
  .atk-run-title { font-weight: bold; font-size: 11px; letter-spacing: .1em; color: #ff1744; margin-bottom: 8px; }
  .atk-summary { display: flex; gap: 14px; font-size: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .atk-evts td { padding: 2px 8px; }
</style>
</head>
<body>
<h1>STG — SASE TRAFFIC GENERATOR REPORT</h1>
<div class="meta">Generated: ${date} &nbsp;|&nbsp; Duration: ${dur} &nbsp;|&nbsp; Mode: ${IS_ELECTRON ? 'Real Traffic (Electron)' : 'Mock (Browser)'} &nbsp;|&nbsp; Build: v${BUILD_INFO.version} · ${BUILD_INFO.commit}</div>
<h2>SUMMARY</h2>
<div class="grid">
  <div class="card"><div class="card-title">TOTAL</div>
    <div class="row"><span>Attempts</span><span class="val">${tot.sent}</span></div>
    <div class="row"><span>Passed</span><span class="val ok">${tot.ok} (${passRate}%)</span></div>
    <div class="row"><span>Blocked</span><span class="val blk">${tot.blk} (${blockRate}%)</span></div>
    <div class="row"><span>Warnings</span><span class="val wrn">${tot.wrn}</span></div>
    <div class="row"><span>Errors</span><span class="val err">${tot.err}</span></div>
    <div class="row"><span>TX</span><span class="val">${fmtBytes(tot.txBytes)}</span></div>
    <div class="row"><span>RX</span><span class="val">${fmtBytes(tot.rxBytes)}</span></div>
  </div>
  ${Object.values(state.config.categories).map(cat => {
    const s = state.stats[cat.id] || {};
    return `<div class="card"><div class="card-title">${cat.label}</div>
      <div class="row"><span>Sent</span><span class="val">${s.sent||0}</span></div>
      <div class="row"><span>OK</span><span class="val ok">${s.ok||0}</span></div>
      <div class="row"><span>Blocked</span><span class="val blk">${s.blk||0}</span></div>
      <div class="row"><span>Errors</span><span class="val err">${(s.wrn||0)+(s.err||0)}</span></div>
    </div>`;
  }).join('')}
</div>
${attackRunsHtml}
<h2>EVENT LOG (last 1000)</h2>
<table>
  <thead><tr><th>TIME</th><th>CATEGORY</th><th>STATUS</th><th>MODE</th><th>CODE</th><th>URL</th><th>RESPONSE</th></tr></thead>
  <tbody>${evtRows}</tbody>
</table>
</body>
</html>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // EVENT HANDLERS — WIRING
  // ─────────────────────────────────────────────────────────────────

  function wireEvents() {

    // Start / Stop
    document.getElementById('btn-start').addEventListener('click', () => {
      if (state.running) {
        stopTraffic();
        document.getElementById('btn-start').textContent = '▶ START';
        document.getElementById('btn-start').classList.remove('running');
        document.getElementById('status-dot').className = 'status-dot';
      } else {
        startTraffic();
        document.getElementById('btn-start').textContent = '■ STOP';
        document.getElementById('btn-start').classList.add('running');
        document.getElementById('status-dot').className = 'status-dot running';
      }
      updateTopbarReportVisibility();
    });

    // Attack button → show pre-launch overlay (user configures, then hits LAUNCH)
    document.getElementById('btn-attack').addEventListener('click', () => {
      if (!state.attackRunning) showAttackPrelaunch();
    });

    // CANCEL on pre-launch panel
    document.getElementById('btn-cancel-attack').addEventListener('click', () => {
      document.getElementById('attack-overlay').classList.add('hidden');
    });

    // LAUNCH button on pre-launch panel → starts the sequence
    document.getElementById('btn-do-launch').addEventListener('click', () => {
      runAttack();
    });

    // ABORT during running
    document.getElementById('btn-abort-attack').addEventListener('click', () => {
      state.attackAborted = true;
      state.attackRunning = false;
      document.getElementById('attack-overlay').classList.add('hidden');
      document.getElementById('status-dot').className = state.running ? 'status-dot running' : 'status-dot';
    });

    // Config panel toggle
    document.getElementById('config-toggle').addEventListener('click', () => {
      state.configOpen = !state.configOpen;
      document.getElementById('config-panel').classList.toggle('open', state.configOpen);
      document.getElementById('config-toggle').classList.toggle('open', state.configOpen);
    });

    // Cog → URL editor
    document.getElementById('cog-btn').addEventListener('click', () => openUrlEditor());
    document.getElementById('url-modal-close').addEventListener('click', closeUrlEditor);
    document.getElementById('url-modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('url-modal-overlay')) closeUrlEditor();
    });

    document.getElementById('btn-save-urls').addEventListener('click', closeUrlEditor);

    // RESTORE DEFAULTS — replaces the currently-open tab's URLs with the
    // shipped defaults from DEFAULT_CONFIG, so upgrades with new seeded URLs
    // are accessible even after users have persisted a config.
    document.getElementById('btn-restore-defaults').addEventListener('click', () => {
      if (!urlEditorActiveTab) return;
      const which = urlEditorActiveTab;
      const niceName = which === 'attack'
        ? 'the attack simulation URLs + port list'
        : (state.config.categories[which]?.label || which);
      if (!confirm(`Restore default URLs for ${niceName}?\n\nYour current list will be replaced.`)) return;

      if (which === 'attack') {
        state.config.settings.attack = JSON.parse(JSON.stringify(DEFAULT_CONFIG.settings.attack));
      } else {
        const def = DEFAULT_CONFIG.categories[which];
        if (def) state.config.categories[which].urls = JSON.parse(JSON.stringify(def.urls));
      }
      saveConfig();
      switchUrlTab(which);   // re-render with fresh defaults visible
    });

    // Export / Import config JSON
    document.getElementById('btn-export-cfg').addEventListener('click', () => {
      const json = JSON.stringify(state.config, null, 2);
      downloadText(json, 'stg-config.json', 'application/json');
    });
    document.getElementById('btn-import-cfg').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async () => {
        const text = await inp.files[0].text();
        try {
          const parsed = JSON.parse(text);
          if (parsed.categories) Object.assign(state.config.categories, parsed.categories);
          if (parsed.settings)   Object.assign(state.config.settings, parsed.settings);
          renderConfigCategories();
          renderStatsCards();
          updateStatsCards();
          renderBlockSigTags();
          saveConfig();
          closeUrlEditor();
          openUrlEditor();
        } catch { alert('Invalid JSON file'); }
      };
      inp.click();
    });

    // Filter tabs
    document.querySelectorAll('.ftab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.filter = tab.dataset.filter;
        // Show/hide rows
        document.querySelectorAll('#log-body tr').forEach(tr => {
          tr.style.display = (state.filter === 'all' || tr.dataset.cat === state.filter) ? '' : 'none';
        });
        updateFilterCount();
      });
    });

    // (speed/mode bulk actions now live as a row at the bottom of the
    //  category list in the config panel — wired up in renderConfigCategories)
    document.getElementById('btn-topbar-reset').addEventListener('click', resetAll);
    // (popup preview removed — LIVE PREVIEW tiles are now the single source
    //  of rendering AND measurement for BROWSER / STREAM requests.)
    localStorage.removeItem('stg-preview');

    // In-app tiled live preview (webview grid). Swaps the log for a 3×2 tile grid.
    const liveBtn   = document.getElementById('btn-live-preview');
    const logArea   = document.querySelector('.log-area');
    const previewArea = document.getElementById('preview-area');
    state.livePreview = localStorage.getItem('stg-live-preview') === '1';
    const applyLivePreview = () => {
      liveBtn.classList.toggle('on', state.livePreview);
      logArea.classList.toggle('hidden', state.livePreview);
      previewArea.classList.toggle('hidden', !state.livePreview);
      liveBtn.title = state.livePreview
        ? 'Tiled preview ON — click to return to the log view'
        : 'Toggle in-app tiled preview of BROWSER / STREAM requests';
    };
    applyLivePreview();
    liveBtn.addEventListener('click', () => {
      state.livePreview = !state.livePreview;
      localStorage.setItem('stg-live-preview', state.livePreview ? '1' : '0');
      applyLivePreview();
      // Reset tiles to blank when turning off so they stop consuming resources
      if (!state.livePreview) {
        document.querySelectorAll('.preview-webview').forEach(wv => { try { wv.src = 'about:blank'; } catch (_) {} });
        document.querySelectorAll('.preview-url').forEach(u => { u.textContent = '—'; });
      }
    });
    const openReport = () => {
      buildReport();
      document.getElementById('report-modal-overlay').classList.remove('hidden');
    };
    document.getElementById('btn-export-report').addEventListener('click', openReport);
    document.getElementById('btn-topbar-report').addEventListener('click', openReport);

    // About / splash
    document.getElementById('btn-info').addEventListener('click', () => {
      document.getElementById('splash-overlay').classList.remove('hidden');
    });
    document.getElementById('splash-cta').addEventListener('click', () => {
      document.getElementById('splash-overlay').classList.add('hidden');
    });

    // Report modal
    document.getElementById('report-modal-close').addEventListener('click', () => {
      document.getElementById('report-modal-overlay').classList.add('hidden');
    });
    document.getElementById('btn-download-report').addEventListener('click', async () => {
      const html = generateHtmlReport();
      const fn = `stg-report-${new Date().toISOString().slice(0,10)}.html`;
      if (IS_ELECTRON) {
        await window.electronAPI.saveReport({ content: html, defaultName: fn });
      } else {
        downloadText(html, fn, 'text/html');
      }
    });
    document.getElementById('btn-print-report').addEventListener('click', () => window.print());

    // Crawl depth slider
    document.getElementById('crawl-depth').addEventListener('input', e => {
      state.config.settings.crawlDepth = parseInt(e.target.value);
      document.getElementById('crawl-depth-val').textContent = e.target.value;
      saveConfig();
    });

    // (request mode is now per-category — see mode buttons in renderConfigCategories)

    // Timeout
    document.getElementById('timeout-val').addEventListener('change', e => {
      state.config.settings.timeout = parseInt(e.target.value) || 10;
      saveConfig();
    });

    // Add block signature
    document.getElementById('btn-add-sig').addEventListener('click', () => {
      const val = prompt('Enter block signature string:');
      if (val && val.trim()) {
        state.config.settings.blockSignatures.push(val.trim());
        renderBlockSigTags();
        saveConfig();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('btn-start').click();
      }
      if (e.key === 'Escape') {
        document.getElementById('url-modal-overlay').classList.add('hidden');
        document.getElementById('report-modal-overlay').classList.add('hidden');
        document.getElementById('splash-overlay').classList.add('hidden');
      }
    });
  }

  function setAllSpeeds(speed) {
    Object.values(state.config.categories).forEach(cat => { cat.speed = speed; });
    renderConfigCategories();
    if (state.running) {
      Object.keys(state.timers).forEach(k => clearTimeout(state.timers[k]));
      state.timers = {};
      Object.keys(state.config.categories).forEach(k => {
        if (state.config.categories[k].enabled) scheduleNext(k);
      });
    }
    saveConfig();
  }

  function setAllModes(mode) {
    Object.values(state.config.categories).forEach(cat => { cat.mode = mode; });
    renderConfigCategories();
    saveConfig();
  }

  function downloadText(text, filename, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ─────────────────────────────────────────────────────────────────
  // INITIALISATION
  // ─────────────────────────────────────────────────────────────────

  async function init() {
    await loadBuildInfo();
    await loadConfig();

    // Brand-bar version badge
    const vEl = document.getElementById('brand-version');
    if (vEl) {
      vEl.textContent = `v${BUILD_INFO.version} · ${BUILD_INFO.commit}`;
      vEl.title = `Version: ${BUILD_INFO.version}\nCommit: ${BUILD_INFO.commit}\nBranch: ${BUILD_INFO.branch}\nBuilt:  ${BUILD_INFO.built}`;
    }

    state.stats = defaultStats();

    // Set initial settings UI state
    document.getElementById('crawl-depth').value = state.config.settings.crawlDepth;
    document.getElementById('crawl-depth-val').textContent = state.config.settings.crawlDepth;
    document.getElementById('timeout-val').value = state.config.settings.timeout;

    renderConfigCategories();
    renderBlockSigTags();
    renderStatsCards();
    updateStatsCards();
    wireEvents();
    startUptimeTick();

    // Show empty log state
    document.getElementById('log-empty').classList.add('visible');

    // Splash shows on every launch so the status guide / support contact
    // are always one click away. Dismiss with GET STARTED or Escape.
    document.getElementById('splash-overlay').classList.remove('hidden');

    console.log(`STG initialised — ${IS_ELECTRON ? 'Electron (real traffic)' : 'Browser (mock mode)'}`);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
