// Writes renderer/version.json with version, git hash, and build date.
// Run automatically before every build via the pre-build npm hook.
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const pkg = require('./package.json');

let commit = 'nogit';
let branch = '';
try {
  commit = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  // Mark as dirty if working tree differs
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (status) commit += '+dirty';
  } catch (_) {}
} catch (_) {}

const info = {
  version: pkg.version,
  commit,
  branch: branch || '—',
  built:  new Date().toISOString(),
};

const target = path.join(__dirname, 'renderer', 'version.json');
fs.writeFileSync(target, JSON.stringify(info, null, 2) + '\n', 'utf8');
console.log(`Wrote ${target}: v${info.version} @ ${info.commit}`);
