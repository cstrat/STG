const { app, BrowserWindow, ipcMain, dialog, net, screen } = require('electron');
const path  = require('path');
const nNet  = require('net');
const fs    = require('fs');

let mainWindow;

// When true, browser + stream requests show their hidden BrowserWindow as a
// small always-on-top preview in the bottom-right corner so the user can
// watch traffic as it happens. Toggled from the renderer via IPC.
let previewMode = false;

function previewBounds() {
  const disp = screen.getPrimaryDisplay();
  const w = 480, h = 290, margin = 24;
  return {
    x: disp.workArea.x + disp.workArea.width  - w - margin,
    y: disp.workArea.y + disp.workArea.height - h - margin,
    width: w, height: h,
  };
}

// Apply preview-mode window treatment — shows in corner, click-through, floating
function makePreview(win) {
  try {
    const b = previewBounds();
    win.setBounds(b);
    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true);
    win.setSkipTaskbar(true);
    win.show();
  } catch (_) {}
}

ipcMain.handle('set-preview-mode', (_event, on) => {
  previewMode = !!on;
  return previewMode;
});

function createWindow() {
  // Icon — try the bundled resources path first, fall back to build/
  const iconCandidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, 'build', 'icon.png'),
  ];
  const icon = iconCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0c0e12',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── HTTP Request via electron.net ───────────────────────────────────────────
// Uses Chromium's network stack: respects OS cert store (FortiSASE SSL
// inspection CA is trusted), follows system proxy settings, handles redirects.

// Cloudflare challenge / bot-check signatures — checked before generic block signatures
const CF_SIGNATURES = [
  'cf-ray',
  'cf-challenge',
  'just a moment',
  'checking your browser',
  'please complete the security check',
  'attention required! | cloudflare',
  'ray id:',
  'enable javascript and cookies to continue',
];

// Classify a response into blocked / challenge / neither
function classifyResponse({ status, bodySnippet, finalUrl, sigs }) {
  const lowerBody  = (bodySnippet || '').toLowerCase();
  const urlBlocked = /fortiguard|fortigate|fortiproxy|block\.fortinet/i.test(finalUrl || '');
  const cfDetected = CF_SIGNATURES.some(s => lowerBody.includes(s));
  const sigBlocked = sigs.some(s => lowerBody.includes(s.toLowerCase()));

  // SASE-specific indicators always win
  if (urlBlocked)  return { blocked: true,  challenge: false };
  // CF challenge wins over generic 403 / block signatures
  if (cfDetected)  return { blocked: false, challenge: true  };
  // Generic block detection
  if (status === 403 || sigBlocked) return { blocked: true, challenge: false };
  return { blocked: false, challenge: false };
}

ipcMain.handle('make-http-request', (_event, { url, timeout, blockSignatures }) => {
  return new Promise((resolve) => {
    const startTime   = Date.now();
    const timeoutMs   = (timeout || 15) * 1000;
    const fullUrl     = url.startsWith('http') ? url : `https://${url}`;
    const sigs        = blockSignatures || ['FortiGuard', 'Web Page Blocked', 'Access Denied', 'fortinet', 'URL blocked'];

    let rxBytes     = 0;
    const txEstimate = fullUrl.length + 300;
    let bodySnippet = '';
    let settled     = false;
    let gotResponse = false;
    let status      = 0;
    let statusText  = '';
    let finalUrl    = fullUrl;

    const done = (result) => {
      if (!settled) { settled = true; resolve(result); }
    };

    // On timeout: if we had received any response data, use what we have;
    // otherwise report a genuine timeout.
    let req;
    const timer = setTimeout(() => {
      try { req && req.abort(); } catch (_) {}
      if (gotResponse) {
        const cls = classifyResponse({ status, bodySnippet, finalUrl, sigs });
        done({ status, statusText, txBytes: txEstimate, rxBytes, time: timeoutMs, ...cls, finalUrl });
      } else {
        done({ status: 0, statusText: 'Timeout', txBytes: txEstimate, rxBytes, time: timeoutMs, blocked: false, challenge: false, error: 'Request timed out' });
      }
    }, timeoutMs);

    try {
      req = net.request({ method: 'GET', url: fullUrl, redirect: 'follow' });
    } catch (e) {
      clearTimeout(timer);
      return done({ status: 0, statusText: e.message, txBytes: 0, rxBytes: 0, time: 0, blocked: false, challenge: false, error: e.message });
    }

    req.setHeader('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
    req.setHeader('Accept-Language', 'en-US,en;q=0.5');
    req.setHeader('Accept-Encoding', 'identity');

    req.on('response', (response) => {
      gotResponse = true;
      status      = response.statusCode;
      statusText  = response.statusMessage || '';
      finalUrl    = response.url || fullUrl;

      const resolveFromResponse = () => {
        clearTimeout(timer);
        const cls = classifyResponse({ status, bodySnippet, finalUrl, sigs });
        done({ status, statusText, txBytes: txEstimate, rxBytes, time: Date.now() - startTime, ...cls, finalUrl });
      };

      response.on('data', (chunk) => {
        rxBytes += chunk.length;
        if (bodySnippet.length < 3000) bodySnippet += chunk.toString('utf8', 0, chunk.length);
        // Once we have enough body to classify, abort and resolve — saves seconds on big pages
        if (rxBytes > 20000) {
          try { req.abort(); } catch (_) {}
          resolveFromResponse();
        }
      });

      response.on('end',   resolveFromResponse);
      response.on('error', (e) => {
        clearTimeout(timer);
        if (bodySnippet.length > 0) {
          const cls = classifyResponse({ status, bodySnippet, finalUrl, sigs });
          done({ status, statusText, txBytes: txEstimate, rxBytes, time: Date.now() - startTime, ...cls, finalUrl });
        } else {
          done({ status, statusText: e.message, txBytes: txEstimate, rxBytes, time: Date.now() - startTime, blocked: false, challenge: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      clearTimeout(timer);
      done({ status: 0, statusText: e.message, txBytes: txEstimate, rxBytes: 0, time: Date.now() - startTime, blocked: false, challenge: false, error: e.message });
    });

    req.end();
  });
});

// ─── Browser Request (hidden BrowserWindow) ───────────────────────────────────

ipcMain.handle('make-browser-request', (_event, { url, blockSignatures }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const fullUrl   = url.startsWith('http') ? url : `https://${url}`;
    const sigs      = blockSignatures || ['FortiGuard', 'Web Page Blocked', 'fortinet'];

    const win = new BrowserWindow({
      show: false,
      width: 1280, height: 720,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    if (previewMode) makePreview(win);

    let resolved = false;
    const done = (result) => {
      if (!resolved) {
        resolved = true;
        try { win.destroy(); } catch (_) {}
        resolve(result);
      }
    };

    const timer = setTimeout(() =>
      done({ status: 0, statusText: 'Timeout', txBytes: 0, rxBytes: 0, time: 30000, blocked: false, error: 'Browser timeout' }),
      30000
    );

    win.webContents.on('did-finish-load', async () => {
      clearTimeout(timer);
      const time = Date.now() - startTime;
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body ? document.body.innerText.substring(0, 3000) : ""'
        );
        const finalUrl = win.webContents.getURL();
        const cls = classifyResponse({ status: 200, bodySnippet: bodyText || '', finalUrl, sigs });
        done({ status: 200, statusText: 'OK', txBytes: 600, rxBytes: 80000, time, ...cls });
      } catch {
        done({ status: 200, statusText: 'OK', txBytes: 600, rxBytes: 50000, time, blocked: false, challenge: false });
      }
    });

    win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (!isMainFrame) return;
      clearTimeout(timer);
      const likelyBlock = Math.abs(code) === 20 || Math.abs(code) === 6;
      done({ status: code, statusText: desc, txBytes: 200, rxBytes: 0, time: Date.now() - startTime, blocked: likelyBlock, challenge: false, error: desc });
    });

    win.loadURL(fullUrl);
  });
});

// ─── Stream Request (video mode) ──────────────────────────────────────────────
// Hidden BrowserWindow that stays alive for `duration` seconds so videos on
// YouTube / Vimeo / etc. actually buffer and play, generating real streaming
// traffic. Byte totals come from session.webRequest instead of a single GET.

ipcMain.handle('make-stream-request', (_event, { url, duration, blockSignatures }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const fullUrl   = url.startsWith('http') ? url : `https://${url}`;
    const sigs      = blockSignatures || ['FortiGuard', 'Web Page Blocked', 'fortinet'];
    const streamMs  = Math.max(3, Math.min(120, duration || 15)) * 1000;

    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',  // let video auto-play
        backgroundThrottling: false,                 // keep playback active while hidden
      },
    });
    if (previewMode) makePreview(win);

    // Count real bytes crossing the network. content-length covers most
    // assets; chunked streaming (HLS/DASH) falls back to a small per-chunk
    // estimate since the header isn't sent.
    let rxBytes  = 0;
    let txBytes  = 0;
    let requests = 0;

    const webReq = win.webContents.session.webRequest;
    webReq.onSendHeaders({ urls: ['*://*/*'] }, (details) => {
      requests++;
      const hdrs = details.requestHeaders || {};
      txBytes += Object.entries(hdrs).reduce((s, [k, v]) => s + k.length + String(v).length + 4, 0) + (details.url || '').length + 50;
    });
    webReq.onCompleted({ urls: ['*://*/*'] }, (details) => {
      if (details.fromCache) return;
      const hdrs = details.responseHeaders || {};
      const cl   = hdrs['content-length'] || hdrs['Content-Length'];
      const size = cl ? parseInt(Array.isArray(cl) ? cl[0] : cl, 10) : NaN;
      rxBytes += Number.isFinite(size) ? size : 8000;  // fallback estimate per response
    });

    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { win.destroy(); } catch (_) {}
      resolve(result);
    };

    // Hard upper bound in case the page never fires did-finish-load
    const hardTimer = setTimeout(() => {
      done({ status: 0, statusText: 'Stream timeout', txBytes, rxBytes, time: Date.now() - startTime, blocked: false, challenge: false, error: 'Page never finished loading' });
    }, streamMs + 15000);

    win.webContents.once('did-finish-load', () => {
      const loadTime  = Date.now() - startTime;
      const remaining = Math.max(1000, streamMs - loadTime);
      // Hold the window open so video can buffer/play, then classify the result.
      setTimeout(async () => {
        let bodyText = '';
        try {
          bodyText = await win.webContents.executeJavaScript('document.body ? document.body.innerText.substring(0, 3000) : ""');
        } catch (_) {}
        const finalUrl = win.webContents.getURL();
        const cls = classifyResponse({ status: 200, bodySnippet: bodyText, finalUrl, sigs });
        clearTimeout(hardTimer);
        done({ status: 200, statusText: 'OK', txBytes, rxBytes, time: Date.now() - startTime, ...cls });
      }, remaining);
    });

    win.webContents.on('did-fail-load', (_e, code, desc, _u, isMainFrame) => {
      if (!isMainFrame) return;
      clearTimeout(hardTimer);
      const likelyBlock = Math.abs(code) === 20 || Math.abs(code) === 6;
      done({ status: code, statusText: desc, txBytes, rxBytes, time: Date.now() - startTime, blocked: likelyBlock, challenge: false, error: desc });
    });

    win.loadURL(fullUrl).catch(e => {
      clearTimeout(hardTimer);
      done({ status: 0, statusText: e.message, txBytes, rxBytes, time: Date.now() - startTime, blocked: false, challenge: false, error: e.message });
    });
  });
});

// ─── Port Scan ────────────────────────────────────────────────────────────────

ipcMain.handle('port-scan', (_event, { host, ports }) => {
  const results = [];
  const tasks   = ports.map(port => new Promise((resolve) => {
    const sock = new nNet.Socket();
    const t    = Date.now();
    sock.setTimeout(2000);
    sock.connect(port, host, () => {
      results.push({ port, open: true, time: Date.now() - t });
      sock.destroy();
      resolve();
    });
    sock.on('error', () => { results.push({ port, open: false, time: Date.now() - t }); resolve(); });
    sock.on('timeout', () => { results.push({ port, open: false, time: 2000 }); sock.destroy(); resolve(); });
  }));
  return Promise.all(tasks).then(() => results);
});

// ─── Config Persistence ───────────────────────────────────────────────────────

const configPath = () => path.join(app.getPath('userData'), 'stg-config.json');

ipcMain.handle('load-config', () => {
  try {
    if (fs.existsSync(configPath())) return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (_) {}
  return null;
});

ipcMain.handle('save-config', (_event, config) => {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8'); return true; }
  catch { return false; }
});

// ─── Report Save ──────────────────────────────────────────────────────────────

ipcMain.handle('save-report', async (_event, { content, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'stg-report.html',
    filters: [{ name: 'HTML Report', extensions: ['html'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { saved: true, path: result.filePath };
  }
  return { saved: false };
});
