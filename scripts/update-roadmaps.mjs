#!/usr/bin/env node
/**
 * Weekly updater for the offline roadmap collection.
 *
 * 1. Scrapes https://roadmap.sh homepage for all roadmap slugs.
 * 2. Compares with data/roadmaps/*.json using `updatedAt` + content hash.
 * 3. Reports new / changed / removed roadmaps.
 * 4. With --download: fetches changed roadmaps into data/roadmaps/
 *    (progress is stored separately in data/state.json, so updates never
 *    touch your learning progress).
 *
 * Usage:
 *   node scripts/update-roadmaps.mjs             # check only
 *   node scripts/update-roadmaps.mjs --download  # check + download changes
 *   node scripts/update-roadmaps.mjs --json      # machine readable output
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'roadmaps');
const REPORT = path.join(ROOT, 'data', 'update-report.json');
const CONTENT_REPO = path.join(ROOT, 'developer-roadmap');

const UA = 'Mozilla/5.0 (compatible; skill-trail-updater/1.0)';

const args = new Set(process.argv.slice(2));
const DOWNLOAD = args.has('--download');
const JSON_OUT = args.has('--json');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Extract roadmap slugs from the homepage. */
async function fetchSlugs() {
  const html = await fetchText('https://roadmap.sh');
  const slugs = new Set();
  // roadmap links look like href="/frontend" (lowercase-dash, not a known static page)
  const skip = new Set([
    'about', 'ai', 'changelog', 'guides', 'videos', 'official', 'login', 'signup',
    'account', 'faq', 'terms', 'privacy', 'respond', 'airtable', 'sponsor',
    'roadmaps', 'packs', 'newsletters', 'best-practices', 'questions',
  ]);
  for (const m of html.matchAll(/href="\/([a-z0-9-]+)"/g)) {
    const slug = m[1];
    if (skip.has(slug)) continue;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) continue;
    slugs.add(slug);
  }
  // Validate candidates are real roadmaps (JSON exists), drop site pages
  const candidates = [...slugs];
  const valid = new Set();
  for (const s of candidates) {
    try {
      const res = await fetch(`https://roadmap.sh/${s}.json`, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const body = await res.text();
        if (body.startsWith('{') && body.includes('"nodes"')) valid.add(s);
      }
    } catch {
      /* treat as invalid */
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return valid;
}

function localRoadmaps() {
  const out = new Map();
  if (!fs.existsSync(DATA_DIR)) return out;
  for (const f of fs.readdirSync(DATA_DIR).filter((x) => x.endsWith('.json'))) {
    const slug = f.replace(/\.json$/, '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      out.set(slug, {
        updatedAt: data.updatedAt || null,
        nodeCount: (data.nodes || []).length,
        hash: crypto.createHash('sha1').update(JSON.stringify(data.nodes?.length) + '|' + (data.updatedAt || '')).digest('hex').slice(0, 12),
      });
    } catch {
      out.set(slug, { updatedAt: null, nodeCount: 0, hash: 'corrupt' });
    }
  }
  return out;
}

async function checkOne(slug) {
  try {
    const text = await fetchText(`https://roadmap.sh/${slug}.json`);
    const data = JSON.parse(text);
    return { slug, data, ok: true };
  } catch {
    return { slug, data: null, ok: false };
  }
}

async function main() {
  const started = new Date().toISOString();
  if (!JSON_OUT) console.log(`🔎 Checking roadmap.sh for updates (${started})…`);

  let slugs;
  try {
    slugs = await fetchSlugs();
  } catch (e) {
    console.error('Failed to fetch roadmap.sh homepage:', e.message);
    process.exit(2);
  }

  const local = localRoadmaps();
  const known = new Set(local.keys());
  const newSlugs = [...slugs].filter((s) => !known.has(s));

  if (!JSON_OUT) {
    console.log(`  remote: ${slugs.size} roadmaps · local: ${known.size}`);
    if (newSlugs.length) console.log(`  🆕 new roadmaps: ${newSlugs.join(', ')}`);
    if (known.size) {
      const removed = [...known].filter((s) => !slugs.has(s));
      if (removed.length) console.log(`  ⚠️ no longer listed remotely: ${removed.join(', ')}`);
    }
  }

  // Check updatedAt for all known roadmaps (politely, sequential with tiny delay)
  const changed = [];
  const unchanged = [];
  const failed = [];
  let i = 0;
  for (const slug of slugs) {
    i++;
    if (!JSON_OUT && i % 25 === 0) console.log(`  …checked ${i}/${slugs.size}`);
    const { data, ok } = await checkOne(slug);
    if (!ok || !data) {
      failed.push(slug);
      continue;
    }
    const loc = local.get(slug);
    const remoteUpdated = data.updatedAt || null;
    if (!loc) {
      changed.push({ slug, reason: 'new', remoteUpdated });
    } else if (remoteUpdated && loc.updatedAt && remoteUpdated !== loc.updatedAt) {
      changed.push({ slug, reason: 'updated', localUpdated: loc.updatedAt, remoteUpdated });
    } else if (!remoteUpdated && loc.nodeCount !== (data.nodes || []).length) {
      changed.push({ slug, reason: 'node-count-changed', localUpdated: loc.updatedAt, remoteUpdated });
    } else {
      unchanged.push(slug);
    }
    await new Promise((r) => setTimeout(r, 60)); // be polite
  }

  // Download phase
  let downloaded = [];
  if (DOWNLOAD && changed.length) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const c of changed) {
      const { data } = await checkOne(c.slug);
      if (!data) continue;
      const file = path.join(DATA_DIR, c.slug + '.json');
      fs.writeFileSync(file, JSON.stringify(data), 'utf8');
      downloaded.push(c.slug);
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // Sync the topic-content repo (markdown per node) so resources work offline
  let contentSync = { syncedAt: null, error: null, aheadBy: 0 };
  if (DOWNLOAD && fs.existsSync(CONTENT_REPO)) {
    try {
      const before = execFileSync('git', ['-C', CONTENT_REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      const out = execFileSync('git', ['-C', CONTENT_REPO, 'pull', '--ff-only'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const after = execFileSync('git', ['-C', CONTENT_REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      contentSync = { syncedAt: new Date().toISOString(), error: null, aheadBy: after !== before ? 1 : 0, from: before, to: after };
      if (!JSON_OUT) console.log(`📚 content repo synced (${before} → ${after})`);
    } catch (e) {
      contentSync = { syncedAt: new Date().toISOString(), error: String(e.stderr || e.message).split('\n').filter(Boolean).slice(-3).join(' '), aheadBy: 0 };
      if (!JSON_OUT) console.log(`⚠️  content repo sync failed: ${contentSync.error}`);
    }
  }

  // Report local roadmaps whose node content is missing from the content repo
  const missingContent = [];
  if (fs.existsSync(CONTENT_REPO)) {
    for (const slug of known) {
      const dir = path.join(CONTENT_REPO, 'roadmaps', slug, 'content');
      if (!fs.existsSync(dir) || fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length === 0) {
        missingContent.push(slug);
      }
    }
  }
  if (!JSON_OUT && missingContent.length) {
    console.log(`  ⚠️ no topic content available offline for: ${missingContent.join(', ')}`);
  }

  const report = {
    checkedAt: started,
    remoteCount: slugs.size,
    localCount: known.size,
    newRoadmaps: newSlugs,
    changed,
    unchangedCount: unchanged.length,
    failed,
    downloaded,
    downloadedAt: DOWNLOAD ? new Date().toISOString() : null,
    contentSync,
    missingContent,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1), 'utf8');

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.log('');
    console.log(`✅ check complete → ${path.relative(ROOT, REPORT)}`);
    console.log(`   new: ${newSlugs.length} · changed: ${changed.length} · unchanged: ${unchanged.length} · failed: ${failed.length}`);
    if (!DOWNLOAD && changed.length) {
      console.log(`\nℹ️  Run with --download to fetch the ${changed.length} new/updated roadmap(s).`);
    }
    if (downloaded.length) {
      console.log(`⬇️  downloaded: ${downloaded.join(', ')}`);
    }
    console.log('\nYour learning progress is stored separately (data/state.json) and is never affected.');
  }
}

main();
