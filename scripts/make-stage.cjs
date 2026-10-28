#!/usr/bin/env node
/**
 * Builds a clean, deterministic Vercel deploy stage from source.
 * Only the files Vercel needs are copied, so a deploy can never ship a stale
 * or hand-edited copy of the API/frontend.
 *
 * Usage: node scripts/make-stage.cjs [outDir]   (default: _deploy_stage)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || '_deploy_stage');

// Exact allow-list of what gets deployed.
const FILES = ['index.html', 'vercel.json', 'package.json', 'package-lock.json', '.vercelignore'];
const DIRS = ['css', 'js', 'lib'];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) throw new Error('missing required directory: ' + rel);
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(src, name);
    if (fs.statSync(full).isDirectory()) copyDir(path.join(rel, name));
    else copyFile(full, path.join(OUT, rel, name));
  }
}
function apiJs() {
  const src = path.join(ROOT, 'api');
  const js = fs.readdirSync(src).filter((f) => f.endsWith('.js'));
  if (!js.length) throw new Error('no api/*.js handlers found');
  for (const f of js) copyFile(path.join(src, f), path.join(OUT, 'api', f));
  return js.length;
}

function main() {
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const f of FILES) {
    if (fs.existsSync(path.join(ROOT, f))) { copyFile(path.join(ROOT, f), path.join(OUT, f)); n++; }
  }
  for (const d of DIRS) { copyDir(d); }
  const handlers = apiJs();
  // Preserve the project link so `vercel deploy` from the stage targets the same project.
  if (fs.existsSync(path.join(ROOT, '.vercel'))) copyDir('.vercel');

  const count = (function walk(p) {
    let c = 0;
    for (const name of fs.readdirSync(p)) {
      const full = path.join(p, name);
      c += fs.statSync(full).isDirectory() ? walk(full) : 1;
    }
    return c;
  })(OUT);

  console.log('stage ready at ' + OUT);
  console.log('  api handlers: ' + handlers + ' | top-level entries: ' + n + ' | total files: ' + count);
  const bad = (function scan(p) {
    const hits = [];
    for (const name of fs.readdirSync(p)) {
      const full = path.join(p, name);
      if (fs.statSync(full).isDirectory()) hits.push(...scan(full));
      else if (/\.(php|sql)$/.test(name) || name === '.htaccess' || name === 'node_modules') hits.push(path.relative(OUT, full));
    }
    return hits;
  })(OUT);
  if (bad.length) { console.error('ERROR: stage contains non-deployable files: ' + bad.join(', ')); process.exit(1); }
  console.log('  verified: no .php / .sql / .htaccess / node_modules in stage');
}
main();
