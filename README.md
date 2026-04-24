# STG — SASE Traffic Generator

**Current version: 1.3.0**

A desktop traffic-simulation tool for FortiSASE (and other SASE-vendor) demo environments. STG generates realistic categorised web traffic through a running SASE agent so you can demonstrate URL filtering, threat detection, and reporting in a predictable, repeatable way.

The build fingerprint (`v1.3.0 · <git-hash>`) is shown in the top bar of the app, so exported reports and bug reports can be tied back to a specific build.

---

## Install

### Debian / Ubuntu (preferred)

Grab the `.deb` for your architecture from the [latest release](https://github.com/cstrat/STG/releases/latest):

```bash
sudo apt install ./STG-1.3.0-arm64.deb     # or STG-1.3.0-amd64.deb on x86-64
```

This handles dependencies, registers STG in your app menu, and gives you a `stg-sase-traffic-generator` terminal command. No launcher script required.

### Other Linux distros (AppImage)

```bash
chmod +x STG-1.3.0-arm64.AppImage
./STG-1.3.0-arm64.AppImage
```

On Ubuntu 24+ the Chromium setuid sandbox can't initialise under AppImage's extract-and-run, so the app starts with `--no-sandbox`. This is deliberate and expected — the trade-off is documented in the security review below.

### Windows

Portable `.exe` from the release page — no install, double-click to run.

### macOS

Unsigned `.dmg` / `.zip` from the release page. First launch needs a right-click → Open to bypass Gatekeeper.

---

## What it does

| Feature | Detail |
|---|---|
| **Six traffic categories** | Artificial Intelligence, Social Media, Instant Messaging, Video Streaming, News, Malicious |
| **Fully editable URL lists** | Every URL in every category is editable via the ⚙ URL SETTINGS editor (separate tab for attack vectors). **RESTORE DEFAULTS** on any tab re-seeds the shipped list. |
| **Per-category speed** | SLOW (15 s) / MED (6 s) / FAST (2 s). Speed applies to HTTP mode only — BROWSER / STREAM pace themselves on real page-load time. |
| **Per-category mode** | **HTTP** (Node `electron.net`), **BROWSER** (Chromium `<webview>` with crawl), **MIX** (alternates per request). |
| **Per-URL stream flag (video)** | Video-tab entries can be marked as streaming — the tile holds for 15 s so YouTube / Vimeo / Twitch / Kick autoplay actually plays through. |
| **Crawl depth (BROWSER)** | After the initial load, BROWSER mode clicks through `crawlDepth − 1` random on-page links. Each hop logs as its own event with its own byte delta. |
| **Live Preview tiles** | **👁 LIVE PREVIEW** swaps the log for a 3 × 2 grid of live `<webview>` tiles — see and hear what each category is loading. Same webview is the measurement source; no duplicate loads. |
| **⚡ Cyber Attack simulation** | Pre-launch overlay selects vectors — port scans, EICAR downloads, C2 beacons, phishing, exfiltration — then runs ~30–60 s. Per-run history is kept for the report. |
| **Cloudflare challenge detection** | Separate CHALLENGE status distinguishes CF / CAPTCHA pages from real SASE blocks. |
| **Parallel start** | All enabled categories fire their first request immediately on START — no speed-interval wait before traffic begins. |
| **Live log** | Colour-coded by category and outcome, filterable by category, newest-first. Crawl hops marked with ↪. |
| **Per-category stats** | Running SENT / OK / BLK / CHA / WRN / ERR + TX / RX bytes. Click a stats card to toggle that category on or off. |
| **HTML report** | Export a self-contained HTML report with summary, per-category breakdown, attack simulation history, and the full event log. |
| **Safety defaults** | File downloads are silently cancelled before any save dialog appears. Permission prompts (geolocation, notifications, mic, camera, clipboard) are denied. `window.open` / `target="_blank"` popups are suppressed. |
| **Persistent config** | URL lists and settings survive app restarts. JSON import / export from the URL editor. |

---

## Running from source

STG works in two modes:

**Browser mock mode** — open `renderer/index.html` directly in Chrome or Firefox. No Node.js required. Outcomes are weighted-random per category (social / video tend to block, AI tends to pass) so the UI can be developed without a SASE client running.

```bash
google-chrome renderer/index.html
# or
firefox renderer/index.html
```

**Electron real-traffic mode** — needs a SASE agent running on the machine:

```bash
npm install   # one-time
npm start
```

In Electron mode, HTTP requests go through Node's `electron.net` stack, BROWSER / STREAM requests go through live `<webview>` tiles, and everything is intercepted by your installed SASE client exactly as any other traffic would be.

---

## Building distributables

```bash
npm run build:linux      # .deb + .AppImage, both arm64 and x86-64
npm run build:linux-x64
npm run build:linux-arm64
npm run build:win        # portable .exe
npm run build:mac        # .dmg + .zip, both arm64 and x86-64
npm run build            # all Linux + Windows in one shot
```

Output lands in `dist/`. Copy to any VM — no installation required for AppImage / portable EXE.

---

## UI guide

### Top bar
- **Status dot** — grey = idle, green = running, red pulsing = attack mode.
- **Uptime** — wall-clock since the app started.
- **Rate** — requests per minute, rolling 60 s window.
- **↑ / ↓** — current TX / RX bandwidth, rolling 5 s window.
- **Total** — cumulative count and bytes.
- **▶ START** / **■ STOP** — also bound to Space from anywhere in the app.
- **⚡ ATTACK** — opens the attack pre-launch overlay.
- **↻ RESET** / **📋 REPORT** — visible after a run; reset clears everything, report opens the summary modal.

### Stats bar (bottom)
Per-category card with enable toggle, SENT / OK / BLK / CHA / WRN / ERR counters, and TX / RX bytes. Click the title to toggle that category on or off. **CONFIGURATION** expands the settings panel upward; **URL SETTINGS** opens the URL editor modal.

### Configuration panel
Per-category speed, mode, and URL count shortcut. Global timeout, crawl depth, and block-detection signatures. Bulk SLOW/MED/FAST and HTTP/BROWSER/MIX buttons apply across all categories.

### ⚙ URL editor
Edit, add, remove URLs per category. Separate **⚡ ATTACK** tab edits the port list and the URL lists for EICAR / C2 / phishing / exfiltration vectors. **RESTORE DEFAULTS** re-seeds the current tab; **IMPORT / EXPORT JSON** round-trips the full config.

### ⚡ Attack overlay
Pick the vectors you want to run, then **LAUNCH ATTACK**:
1. Port scans (22, 23, 445, 3389, 4444, 1337, …)
2. EICAR test-file download attempts (multiple variants)
3. C2 beacon attempts to known-malicious domains
4. Malware-dropper / payload download simulation
5. Data-exfiltration beacon simulation

Normal traffic pauses for the duration; progress, counts, and a mini-log stream during the run. **■ ABORT** at any time. Per-run history is kept for the report.

### ? button (splash / about)
First-launch tour with the status-guide legend. Re-openable from the **?** button in the top bar.

---

## Block detection

A request is classified **BLOCKED** when:
1. The final URL matches SASE block pages (`fortiguard`, `fortigate`, `fortiproxy`, `block.fortinet`), **or**
2. HTTP status is `403`, **or**
3. The response body contains any configured signature string (default: `FortiGuard`, `Web Page Blocked`, `Access Denied`, `fortinet`, `URL blocked`).

A request is classified **CHALLENGE** when the body matches Cloudflare / bot-check signatures (`cf-ray`, `just a moment`, `checking your browser`, `attention required! | cloudflare`, …). Challenges are *not* SASE blocks — they're the origin protecting itself from a scripted client. SASE-specific signals win over CF detection; CF detection wins over generic 403.

Add or remove signatures in the Configuration panel to match your specific SASE vendor's block-page content.

---

## Configuration storage

| Mode | Location |
|---|---|
| Electron | `~/.config/STG - SASE Traffic Generator/stg-config.json` (Linux), equivalent per OS |
| Browser mock | `localStorage` key `stg-config` |

Use the URL editor's **IMPORT / EXPORT JSON** buttons to move a full config between machines. Imported JSON is sanitised before it's applied: unknown keys are dropped, `__proto__` / `constructor` are rejected, URL entries must parse as http or https, and numeric ranges are clamped.

---

## Security posture

STG handles hostile-by-design content (malicious URLs, attack vectors, third-party response bodies), so it's built to keep that containment tight. A full security review was completed at v1.3.0 and drove the hardening in that release. The key properties:

- **`contextIsolation: true`, `nodeIntegration: false`, `webviewTag: true`**. The renderer has no direct Node access; all privileged operations go through a narrow `electronAPI` IPC surface exposed by `preload.js` (make-http-request, classify-response, port-scan, load/save config, save-report, webview-bytes-get/reset).
- **Preview session is locked down**. The shared `persist:stg-preview` session cancels every download before any save dialog can appear, denies all permission requests (geolocation, notifications, mic, camera, clipboard), and suppresses `window.open` / `target="_blank"` popups.
- **Content Security Policy** on the renderer restricts `script-src` to `'self'`, forbids plugins (`object-src 'none'`), and prevents `<base>` tampering (`base-uri 'none'`).
- **Every dynamic `innerHTML` sink HTML-escapes** user-configurable URLs, HTTP status text from origins, imported-config values, and block-signature strings. Log rows, the in-app report modal, and the exported HTML report all render untrusted text as text.
- **Imported config is sanitised**, never `Object.assign`ed. Only whitelisted keys with expected types are copied; `__proto__` / `constructor` / `prototype` are stripped; URL entries that don't parse as http(s) are dropped; counts and timeouts are clamped.
- **Chromium sandbox caveat**. AppImage on Ubuntu 24+ can't set the setuid sandbox and AppArmor blocks the user-namespace fallback, so the app starts with `--no-sandbox`. The CSP + escaping + narrow IPC surface are the defences in depth against that trade-off. If you are packaging STG for a hardened environment, consider building the `.deb` (which installs the setuid helper correctly) and re-enabling the sandbox.

`npm audit` is clean. Electron is pinned at 41.x.

---

## Project structure

```
STG - SASE Traffic Generator/
├── main.js              Electron main process — HTTP via electron.net, session hardening,
│                        port scan, config load/save, report save, byte tracking
├── preload.js           contextBridge IPC surface exposed to the renderer
├── package.json         Dependencies + electron-builder config
├── generate-version.js  Writes renderer/version.json (version + git hash + branch) before builds
├── build-icon.js        Rasterises the STG logo SVG to PNG icons at 9 sizes
├── launch.sh            Self-healing AppImage launcher (libz shim, FUSE workaround,
│                        user-level desktop-file + icon install)
├── build/
│   ├── icon.png         Master BrowserWindow icon
│   └── icons/           Per-size PNGs used by electron-builder
├── renderer/
│   ├── index.html       UI structure + CSP
│   ├── style.css        All styles (dark terminal aesthetic)
│   ├── app.js           All frontend logic — works in browser (mock) and Electron (real)
│   └── version.json     Generated at build time
├── dist/                Build output (.deb / .AppImage / .exe / .dmg / .zip)
└── RELEASE_NOTES.md     Latest-release changelog
```

---

## AI-generated code notice

STG was largely written with **Claude Opus** (Anthropic), working in pair with the maintainer. Architecture, feature scoping, testing, and security review were collaborative — human-reviewed before each release. Users integrating STG into their own workflows should review the source themselves: it's a small codebase by design (one main process file, one preload, one renderer script) so that's tractable.

---

## Support

For questions or issues, file a ticket at <https://github.com/cstrat/STG/issues> and include the build fingerprint shown in the top bar of the app (e.g. `v1.3.0 · d45386c1+dirty`).
