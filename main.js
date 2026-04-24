const { app, BrowserWindow, ipcMain, dialog, net, session } = require('electron');
const path  = require('path');
const nNet  = require('net');
const fs    = require('fs');

let mainWindow;

// ─── Per-webContents byte tracking for LIVE PREVIEW webviews ─────────────
// Hooks the shared persist:stg-preview session so bytes sent/received can be
// attributed to each tile. The renderer snaps counters before/after each
// request by webContentsId. More accurate than counting single responses
// because streams/playback fire many requests over the hold window.
const byteCounts = new Map();
function bumpBytes(id, deltaTx, deltaRx) {
  if (id == null) return;
  const b = byteCounts.get(id) || { tx: 0, rx: 0 };
  b.tx += deltaTx || 0;
  b.rx += deltaRx || 0;
  byteCounts.set(id, b);
}

app.once('ready', () => {
  const sess = session.fromPartition('persist:stg-preview');

  sess.webRequest.onSendHeaders({ urls: ['*://*/*'] }, (details) => {
    const hdrs = details.requestHeaders || {};
    const size = Object.entries(hdrs).reduce((s, [k, v]) => s + k.length + String(v).length + 4, 0) + (details.url || '').length + 50;
    bumpBytes(details.webContentsId, size, 0);
  });
  sess.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (details.fromCache) return;
    const hdrs = details.responseHeaders || {};
    const cl   = hdrs['content-length'] || hdrs['Content-Length'];
    const sz   = cl ? parseInt(Array.isArray(cl) ? cl[0] : cl, 10) : NaN;
    bumpBytes(details.webContentsId, 0, Number.isFinite(sz) ? sz : 8000);
  });

  // ── Safety: suppress every user-facing dialog the crawler could trigger ──
  // A page linking to a PDF / ZIP / EXE etc. would otherwise pop the OS save
  // dialog mid-demo. Cancel every download before it starts.
  sess.on('will-download', (e) => e.preventDefault());

  // Silently deny permission requests (geolocation, notifications, mic, camera,
  // clipboard-read, etc.) so auto-playing sites can't prompt the user.
  sess.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  sess.setPermissionCheckHandler(() => false);

  // Suppress window.open / target="_blank" popups from any crawled page.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Cancel downloads that sneak through outside the preview session too
    contents.session.on('will-download', (e) => e.preventDefault());
  });
});

ipcMain.handle('webview-bytes-reset', (_event, webContentsId) => {
  byteCounts.set(webContentsId, { tx: 0, rx: 0 });
});
ipcMain.handle('webview-bytes-get', (_event, webContentsId) => {
  return byteCounts.get(webContentsId) || { tx: 0, rx: 0 };
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
      webviewTag: true,
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

// (make-browser-request / make-stream-request removed — BROWSER and STREAM
//  requests now happen in the renderer via the live-preview <webview> tiles.
//  Bytes are counted by the persist:stg-preview session hook above; page
//  content / final URL / block classification are done renderer-side.)

// Expose classifyResponse via IPC so the renderer can use the same block-
// detection logic it used to for HTTP mode responses.
ipcMain.handle('classify-response', (_event, args) => classifyResponse(args));

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
