// Headless layout sanity-check.
// Loads renderer/index.html in a hidden Electron window and saves a PNG so
// I can eyeball the layout before building a release. Runs in browser
// (mock) mode since no preload is attached — that's fine for layout.
//
// Run with:  env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron screenshot-layout.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');

app.whenReady().then(async () => {
  const out = process.argv[2] || '/tmp/stg-layout.png';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,          // capturePage needs the window actually realised
    x: -2000, y: -2000,  // but off-screen so it doesn't flash
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      offscreen: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  // Dismiss the splash so the stats bar is visible
  await win.webContents.executeJavaScript(`
    const sp = document.getElementById('splash-overlay');
    if (sp) sp.classList.add('hidden');
  `);
  await new Promise(r => setTimeout(r, 600));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(out, image.toPNG());
  const { width, height } = image.getSize();
  console.log(`Saved ${out}  (${width}×${height})`);
  app.quit();
});
