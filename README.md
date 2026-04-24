# STG — SASE Traffic Generator

**Current version: 1.1.0**

A professional traffic simulation tool for FortiSASE (and other SASE vendor) demo environments. Generates realistic categorised web traffic through a running SASE agent, making it easy to demonstrate URL filtering, threat detection, and reporting capabilities.

The build fingerprint (`v1.1.0 · <git-hash>`) is shown in the top bar of the app so reports and bug reports can be tied back to a specific build.

---

## Features

| Feature | Detail |
|---|---|
| **Traffic Categories** | Artificial Intelligence, Social Media, Instant Messaging, Video Streaming, News, Malicious/Test |
| **Configurable URLs** | Every URL in every category is editable via the ⚙ cog editor (separate tab for attack vectors) |
| **Speed Control** | Per-category: Slow (15s), Medium (6s), Fast (2s) between requests |
| **Request Modes** | Per-category: HTTP, BROWSER (hidden Chromium window), or MIXED (alternates per request) |
| **Cyber Attack Simulation** | Pre-launch overlay with vector toggles: port scans, EICAR downloads, C2 beacons, phishing, exfiltration |
| **Cloudflare Challenge Detection** | Separate CHALLENGE status distinguishes CF/CAPTCHA pages from real SASE blocks |
| **Live Log** | Colour-coded by category and outcome, filterable, newest-first |
| **Per-Category Stats** | Running counters for sent/OK/BLK/CHA/WRN/ERR + TX/RX bytes |
| **Reports** | Export a self-contained HTML report with summary and full event log |
| **Persistent Config** | URL lists and settings survive app restarts |
| **Splash/About** | First-launch tour with status-guide, re-triggered by the **?** button or any version bump |

---

## Development — run in browser first

The entire UI works as a static HTML page in Chrome/Firefox using **mock data**. No Node.js needed for UI work.

```bash
# Just open the file in Chrome:
google-chrome "renderer/index.html"
# or
firefox "renderer/index.html"
```

Mock mode generates weighted-random outcomes per category (social/video tend to be blocked, AI tends to pass) to simulate a realistic FortiSASE environment.

---

## Development — run as Electron app

To test real HTTP traffic (SASE client must be running on the machine):

```bash
# Install dependencies (one-time)
npm install

# Launch
npm start
```

Electron mode uses actual HTTP requests from the Node.js main process — the FortiSASE agent intercepts these exactly as it would any other traffic.

---

## Building — single distributable file

```bash
# Linux AppImage (single portable file)
npm run build:linux

# Windows portable EXE
npm run build:win

# Both
npm run build
```

Output goes to `dist/`. Copy the `.AppImage` or `.exe` to any VM — no installation required.

```bash
# Linux: make executable and run
chmod +x "dist/STG - SASE Traffic Generator-1.0.0.AppImage"
./"dist/STG - SASE Traffic Generator-1.0.0.AppImage"
```

---

## UI Guide

### Top bar
- **Status dot** — grey = idle, green = running, red pulsing = attack mode
- **Rate** — requests per minute (rolling 60s window)
- **↑/↓** — current TX/RX bandwidth in bytes/sec
- **Total** — cumulative counts and bytes since START

### Config bar
- **▶ CONFIGURATION** — expands the settings panel
- **Category pills** — coloured per category, shows speed. Click to enable/disable that category
- **⚙** — opens the URL editor modal

### Configuration panel
- Per-category enable toggle, speed selection (SLOW/MED/FAST), and URL count shortcut
- Request mode (HTTP vs Browser), timeout, crawl depth
- Block detection signatures (strings searched in response body)
- Bulk speed controls, log/stats reset, report export

### ⚙ URL Editor
Add, remove, or edit URLs for any category. Changes take effect immediately on the next request cycle. Use this to match your specific SASE vendor's URL classification — e.g. LinkedIn may need to be in a different category depending on how your vendor categorises it.

### ⚡ ATTACK button
Triggers a ~30–60 second simulated cyber attack that pauses normal traffic and runs:
1. Port scans (22, 23, 445, 3389, 4444, 1337, etc.)
2. EICAR test file download attempts (multiple variants)
3. C2 beacon attempts to known-malicious domains
4. Malware dropper/payload download simulation
5. Data exfiltration beacon simulation

Normal traffic resumes automatically when the attack completes.

### Space bar
Press **Space** to Start/Stop traffic generation from anywhere in the app.

---

## Block Detection

In Electron (real traffic) mode, a request is classified as **BLOCKED** when:
1. HTTP response status is `403`
2. Response body contains any configured signature string (default: `FortiGuard`, `Web Page Blocked`, `Access Denied`, `fortinet`, `URL blocked`)
3. Browser mode receives a navigation failure matching block patterns

You can add/remove signatures in the Configuration panel to match your specific SASE vendor's block page content.

---

## Configuration Persistence

- **Browser mode**: settings saved to `localStorage`
- **Electron mode**: settings saved to a JSON file in the OS user data directory (`~/.config/STG - SASE Traffic Generator/stg-config.json` on Linux)

You can also export/import the full config as JSON via the ⚙ URL Editor modal.

---

## Project Structure

```
STG - SASE Traffic Generator/
├── main.js              Electron main process — HTTP via electron.net, port scan, file I/O
├── preload.js           IPC bridge (contextBridge) between main and renderer
├── package.json         Dependencies + electron-builder config
├── generate-version.js  Writes renderer/version.json before each build (version + git hash)
├── build-icon.js        Rasterises the STG logo SVG to PNG icons at 9 sizes
├── launch.sh            Self-healing launcher (handles libz, FUSE, dock integration)
├── build/
│   ├── icon.png         Master icon for the Electron BrowserWindow
│   └── icons/           Per-size PNGs used by electron-builder
├── renderer/
│   ├── index.html       UI structure
│   ├── style.css        All styles (dark terminal aesthetic)
│   ├── app.js           All frontend logic — works in browser (mock) and Electron (real)
│   └── version.json     Generated at build time (version, commit, branch, built)
└── dist/                Build output (AppImage, portable EXE)
```

---

## Support

For questions or issues, contact **chris.stratford@vocus.com.au** and include the build fingerprint shown in the top bar of the app (e.g. `v1.1.0 · d45386c1+dirty`).
