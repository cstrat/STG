// Renders the STG icon SVG to PNG at multiple sizes using Electron's Chromium.
// Run with:  env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron build-icon.js

const { app, BrowserWindow } = require('electron');
const fs   = require('fs');
const path = require('path');

const SVG = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- background -->
  <rect width="512" height="512" rx="96" fill="#0c0e12"/>
  <rect x="4" y="4" width="504" height="504" rx="92" fill="none" stroke="#2a3150" stroke-width="6"/>

  <!-- Traffic bars in category colours, decreasing width to evoke a bar chart -->
  <g>
    <rect x="88" y="110" width="336" height="20" rx="4" fill="#00d4ff"/>
    <rect x="88" y="144" width="292" height="20" rx="4" fill="#ff4d8d"/>
    <rect x="88" y="178" width="248" height="20" rx="4" fill="#a78bfa"/>
    <rect x="88" y="212" width="204" height="20" rx="4" fill="#fbbf24"/>
    <rect x="88" y="246" width="160" height="20" rx="4" fill="#38bdf8"/>
    <rect x="88" y="280" width="116" height="20" rx="4" fill="#f97316"/>
  </g>

  <!-- STG wordmark -->
  <text x="256" y="420" text-anchor="middle"
        font-family="ui-monospace, 'Courier New', monospace"
        font-weight="900" font-size="110" fill="#e8edf8" letter-spacing="14">STG</text>
</svg>`;

const HTML = (size) => `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { width: ${size}px; height: ${size}px; display: flex; }
  svg  { width: 100%; height: 100%; display: block; }
</style></head><body>${SVG}</body></html>`;

// Render a single large PNG and we'll downscale it via Electron's nativeImage
app.whenReady().then(async () => {
  const outDir = path.join(__dirname, 'build', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  const MAX = 1024;

  // Render master at 1024x1024 in a visible but off-screen position
  const win = new BrowserWindow({
    width: MAX,
    height: MAX,
    show: true,
    x: -2000, y: -2000,   // off-screen but real
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    webPreferences: {},
  });

  const dataUrl = 'data:text/html;charset=utf-8;base64,' + Buffer.from(HTML(MAX)).toString('base64');
  win.loadURL(dataUrl);

  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  await new Promise(r => setTimeout(r, 400));
  console.log('master rendered, capturing...');

  const master = await win.webContents.capturePage();
  console.log('master captured, size =', master.getSize());
  win.destroy();

  // Write the master + downscaled sizes using nativeImage.resize
  const { nativeImage } = require('electron');
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const resized = size === MAX ? master : master.resize({ width: size, height: size, quality: 'best' });
    const png = resized.toPNG();
    const file = path.join(outDir, `${size}x${size}.png`);
    fs.writeFileSync(file, png);
    console.log(`  ${size}x${size}.png — ${(png.length/1024).toFixed(1)}KB`);
  }

  fs.copyFileSync(path.join(outDir, '512x512.png'), path.join(__dirname, 'build', 'icon.png'));
  console.log('✓ build/icon.png');
  app.quit();
});
