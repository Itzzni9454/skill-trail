#!/usr/bin/env node
/**
 * First-run content bootstrap for Skill Trail.
 *
 * The repository ships application code only. Roadmap content (the official
 * roadmap.sh snapshots and the per-topic markdown) is under roadmap.sh's own
 * restrictive license, which permits personal use but forbids republication —
 * so each user downloads it directly from the source, onto their own machine.
 * Nothing this script fetches is ever committed (see .gitignore).
 *
 * Steps:
 *   1. Shallow-clone kamranahmedse/developer-roadmap → ./developer-roadmap
 *      (per-topic markdown, used for the in-app topic content and search).
 *   2. Fetch every roadmap JSON from https://roadmap.sh/<slug>.json into
 *      data/roadmaps/ (the rendering source of truth).
 *
 * Re-running is safe: existing snapshots are skipped, the clone is pulled.
 *
 * Usage:
 *   npm run bootstrap                     # full bootstrap
 *   node scripts/bootstrap-content.mjs --force       # re-download changed
 *   node scripts/bootstrap-content.mjs --only frontend,backend
 *                                         # fetch specific slugs, skip cloning
 *                                         # (used by CI for the fidelity guard)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'roadmaps');
const CONTENT_REPO = path.join(ROOT, 'developer-roadmap');
const UPSTREAM = 'https://github.com/kamranahmedse/developer-roadmap.git';
const UA = 'Mozilla/5.0 (compatible; skill-trail-bootstrap/1.0)';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  || (argv[argv.indexOf('--only') + 1] || '');

const ok = (m) => console.log(`  ✅ ${m}`);
const skip = (m) => console.log(`  ↷  ${m}`);
const die = (m) => {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
};

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Roadmap slugs from the local content clone. */
function contentSlugs() {
  const src = path.join(CONTENT_REPO, 'roadmaps');
  return fs.existsSync(src)
    ? fs.readdirSync(src).filter((d) => fs.statSync(path.join(src, d)).isDirectory())
    : [];
}

/** Discover every live roadmap slug from roadmap.sh (homepage + /roadmaps). */
async function discoverSlugs() {
  const skipPages = new Set([
    'about', 'ai', 'changelog', 'guides', 'videos', 'official', 'login', 'signup',
    'account', 'faq', 'terms', 'privacy', 'respond', 'airtable', 'sponsor',
    'roadmaps', 'packs', 'newsletters', 'best-practices', 'questions',
  ]);
  const seen = new Set();
  for (const page of ['https://roadmap.sh', 'https://roadmap.sh/roadmaps']) {
    const html = await fetchText(page);
    for (const m of html.matchAll(/href="\/([a-z0-9-]+)"/g)) {
      const slug = m[1];
      if (skipPages.has(slug)) continue;
      if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) seen.add(slug);
    }
  }
  // Validate: a real roadmap has a JSON endpoint that returns nodes.
  const valid = [];
  for (const slug of seen) {
    try {
      const res = await fetch(`https://roadmap.sh/${slug}.json`, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const body = await res.text();
        if (body.startsWith('{') && body.includes('"nodes"')) valid.push(slug);
      }
    } catch { /* skip */ }
    await sleep(40);
  }
  return valid.sort();
}

async function downloadRoadmap(slug) {
  const text = await fetchText(`https://roadmap.sh/${slug}.json`);
  const data = JSON.parse(text); // throws on HTML error pages
  if (!Array.isArray(data.nodes)) throw new Error(`${slug}.json has no nodes array`);
  const dest = path.join(DATA_DIR, `${slug}.json`);
  fs.writeFileSync(dest, JSON.stringify(data), 'utf8');
}

function cloneContentRepo() {
  if (fs.existsSync(path.join(CONTENT_REPO, 'roadmaps'))) {
    if (FORCE) {
      try { sh('git', ['-C', CONTENT_REPO, 'pull', '--ff-only']); } catch { /* offline ok */ }
      ok('content repo updated');
    } else {
      skip('content repo already present');
    }
    return;
  }
  console.log('  ⬇  cloning kamranahmedse/developer-roadmap (shallow)…');
  try {
    sh('git', ['clone', '--depth', '1', UPSTREAM, CONTENT_REPO]);
  } catch (e) {
    die(`Could not clone the content repo: ${String(e.stderr || e.message).trim()}\n     Check your network / proxy and retry.`);
  }
  ok('cloned developer-roadmap (topic content for every roadmap)');
}

async function main() {
  console.log('\n🥾 Skill Trail — content bootstrap\n');
  console.log('  Roadmap content is licensed by roadmap.sh for personal use only; it is');
  console.log('  downloaded from the source to your machine and never committed.\n');

  const wanted = ONLY
    ? ONLY.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  try {
    if (!wanted) cloneContentRepo();

    let slugs;
    if (wanted) {
      slugs = wanted;
    } else {
      process.stdout.write('  🔎 discovering roadmaps on roadmap.sh… ');
      try {
        slugs = await discoverSlugs();
        console.log(`${slugs.length} found`);
      } catch (e) {
        // Homepage scrape failed — fall back to the content-repo slug list.
        const fallback = contentSlugs();
        if (!fallback.length) {
          die(`Could not reach roadmap.sh: ${e.message}\n     Re-run with --force once you are back online.`);
        }
        slugs = fallback;
        console.log(`offline — using the ${fallback.length} slugs from the content clone`);
      }
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    let added = 0, kept = 0, failed = [];
    for (const slug of slugs) {
      const dest = path.join(DATA_DIR, `${slug}.json`);
      if (fs.existsSync(dest) && !FORCE) { kept++; continue; }
      try {
        await downloadRoadmap(slug);
        added++;
      } catch (e) {
        failed.push(slug);
      }
      await sleep(60); // be polite
    }
    if (added) ok(`${added} roadmap snapshot(s) downloaded to data/roadmaps/`);
    if (kept) skip(`${kept} snapshot(s) already present`);
    if (failed.length) console.log(`  ⚠️  failed: ${failed.join(', ')} (re-run to retry)`);

    const total = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).length;
    if (total === 0) die('No roadmap JSONs downloaded — check your network and re-run.');
    ok(`${total} roadmaps ready`);
  } catch (e) {
    die(e.message);
  }

  console.log(`
✅ Bootstrap complete.

  Next:
    npm run setup      # once — install server/ and app/ dependencies
    npm run app:build  # once — build the frontend
    npm start          # → http://localhost:4177
`);
}

main();
