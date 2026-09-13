/**
 * Obsidian & Local Markdown Vault Sync Engine
 *
 * Manages bi-directional synchronization between roadmap state (progress, notes)
 * and a local directory of standard Markdown (.md) files compatible with Obsidian,
 * Logseq, Foam, VS Code, and standard Markdown viewers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, loadState, saveState, mutateState } from './store.js';

export const DEFAULT_VAULT_DIR = path.join(DATA_DIR, 'vault');

/**
 * Sanitize a string to be a safe directory or filename across Windows/macOS/Linux.
 */
export function sanitizeFilename(name, fallback = 'topic') {
  if (!name || typeof name !== 'string') return fallback;
  // Replace invalid characters: / \ : * ? " < > | and control chars
  let clean = name.replace(/[/\\:*?"<>|]/g, '-').trim();
  // Collapse multiple hyphens/spaces
  clean = clean.replace(/\s+/g, ' ').replace(/-+/g, '-').replace(/^[-.\s]+|[-.\s]+$/g, '');
  return clean || fallback;
}

/**
 * Parse frontmatter and markdown body without external dependencies.
 * Handles YAML frontmatter between leading '---' markers.
 */
export function parseMarkdownWithFrontmatter(content) {
  if (typeof content !== 'string') return { frontmatter: {}, body: '' };

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter = {};

  let currentArrayKey = null;
  const lines = rawYaml.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item e.g. "  - item"
    if (line.match(/^\s*-\s+(.+)$/)) {
      const itemMatch = line.match(/^\s*-\s+(.+)$/);
      if (currentArrayKey && Array.isArray(frontmatter[currentArrayKey])) {
        let val = itemMatch[1].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        frontmatter[currentArrayKey].push(val);
      }
      continue;
    }

    // Key-value pair e.g. "key: value"
    const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let val = kvMatch[2].trim();

      if (val === '') {
        // Might be starting a list
        currentArrayKey = key;
        frontmatter[key] = [];
      } else {
        currentArrayKey = null;
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        } else if (val === 'true') {
          val = true;
        } else if (val === 'false') {
          val = false;
        } else if (!isNaN(Number(val)) && val !== '') {
          val = Number(val);
        }
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Serialize frontmatter object and body into standard Markdown with YAML frontmatter.
 */
export function formatMarkdownWithFrontmatter(frontmatter, body) {
  const yamlLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        yamlLines.push(`  - ${item}`);
      }
    } else if (typeof value === 'string') {
      // Escape strings containing quotes or colons
      if (value.includes(':') || value.includes('"') || value.includes('#') || value.includes('\n')) {
        yamlLines.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    } else {
      yamlLines.push(`${key}: ${value}`);
    }
  }
  yamlLines.push('---');
  yamlLines.push('');
  return yamlLines.join('\n') + (body || '').trim() + '\n';
}

/**
 * Get current vault configuration from app state.
 */
export function getVaultConfig() {
  const state = loadState();
  const vault = state.settings?.vault || {};
  const vaultPath = path.resolve(vault.path || DEFAULT_VAULT_DIR);
  const exists = fs.existsSync(vaultPath);

  let fileCount = 0;
  if (exists) {
    try {
      fileCount = countMarkdownFiles(vaultPath);
    } catch {
      fileCount = 0;
    }
  }

  return {
    enabled: Boolean(vault.enabled),
    path: vaultPath,
    isDefault: !vault.path || path.resolve(vault.path) === DEFAULT_VAULT_DIR,
    exists,
    fileCount,
    lastSyncedAt: vault.lastSyncedAt || null,
    autoWatch: vault.autoWatch !== false,
  };
}

/**
 * Save vault configuration.
 */
export function saveVaultConfig(cfg) {
  let updated;
  mutateState((s) => {
    s.settings = s.settings || {};
    const existing = s.settings.vault || {};
    const targetPath = cfg.path ? path.resolve(cfg.path) : (existing.path || DEFAULT_VAULT_DIR);

    s.settings.vault = {
      ...existing,
      enabled: typeof cfg.enabled === 'boolean' ? cfg.enabled : existing.enabled ?? true,
      path: targetPath,
      autoWatch: typeof cfg.autoWatch === 'boolean' ? cfg.autoWatch : existing.autoWatch ?? true,
      lastSyncedAt: cfg.lastSyncedAt || existing.lastSyncedAt || null,
    };
    updated = s.settings.vault;
  });
  return updated;
}

/**
 * Recursively count .md files in a directory.
 */
function countMarkdownFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue; // ignore hidden (.obsidian, .git)
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      count += countMarkdownFiles(full);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      count++;
    }
  }
  return count;
}

/**
 * Get safe relative path for a topic note:
 * <vault>/<roadmapSlug>/<topicName>.md
 */
export function getTopicFilePath(vaultDir, slug, nodeId, label) {
  const safeSlug = sanitizeFilename(slug.replace(/^custom:/, 'custom-'));
  const safeLabel = sanitizeFilename(label || nodeId, `topic-${nodeId}`);
  return path.join(vaultDir, safeSlug, `${safeLabel}.md`);
}

/**
 * Write a single topic note to the vault if vault sync is enabled.
 */
export function writeTopicNoteToVault(slug, nodeId, label, noteContent, status, officialContent = null) {
  const config = getVaultConfig();
  if (!config.enabled) return null;

  try {
    const vaultDir = config.path;
    const safeSlug = sanitizeFilename(slug.replace(/^custom:/, 'custom-'));
    const targetDir = path.join(vaultDir, safeSlug);
    fs.mkdirSync(targetDir, { recursive: true });

    // Look for existing file with this nodeId to prevent renaming duplicates
    let targetFile = findFileByNodeId(targetDir, nodeId);
    let existingFrontmatter = {};
    let existingBody = '';

    if (targetFile && fs.existsSync(targetFile)) {
      const raw = fs.readFileSync(targetFile, 'utf8');
      const parsed = parseMarkdownWithFrontmatter(raw);
      existingFrontmatter = parsed.frontmatter;
      existingBody = parsed.body;
    } else {
      const safeLabel = sanitizeFilename(label || nodeId, `topic-${nodeId}`);
      targetFile = path.join(targetDir, `${safeLabel}.md`);
    }

    const frontmatter = {
      title: label || existingFrontmatter.title || nodeId,
      roadmap: slug,
      nodeId: nodeId,
      status: status || existingFrontmatter.status || 'unstarted',
      tags: [
        'roadmap',
        sanitizeFilename(slug.replace(/^custom:/, 'custom-')),
        status ? `status/${status}` : 'status/unstarted',
      ],
      updated: new Date().toISOString(),
    };

    // Construct body: preserve user notes
    let bodyText = '';
    const cleanNote = (noteContent != null ? String(noteContent) : '').trim();

    if (cleanNote) {
      bodyText = `# ${frontmatter.title}\n\n${cleanNote}\n`;
    } else if (existingBody && !existingBody.includes('<!-- notes-empty -->')) {
      bodyText = existingBody;
    } else {
      bodyText = `# ${frontmatter.title}\n\n<!-- notes-empty -->\n*No notes written yet. Write here in Obsidian or in the Roadmap app to sync!*\n`;
      if (officialContent) {
        bodyText += `\n---\n\n### Official Roadmap Guide\n\n${officialContent}\n`;
      }
    }

    const fileContent = formatMarkdownWithFrontmatter(frontmatter, bodyText);
    fs.writeFileSync(targetFile, fileContent, 'utf8');
    return targetFile;
  } catch (err) {
    console.error(`[vault] Error writing topic note ${slug}/${nodeId}:`, err.message);
    return null;
  }
}

/**
 * Find existing file in a directory that has `nodeId: <nodeId>` in its frontmatter.
 */
function findFileByNodeId(dir, nodeId) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (!f.endsWith('.md') || f === '_overview.md') continue;
    const full = path.join(dir, f);
    try {
      const sample = fs.readFileSync(full, 'utf8').slice(0, 1000);
      if (sample.includes(`nodeId: "${nodeId}"`) || sample.includes(`nodeId: '${nodeId}'`) || sample.includes(`nodeId: ${nodeId}`)) {
        return full;
      }
    } catch {}
  }
  return null;
}

/**
 * Generate and write the roadmap overview file with Obsidian wikilinks and task checklist.
 */
export function writeRoadmapOverview(vaultDir, roadmap, nodeProgress) {
  try {
    const safeSlug = sanitizeFilename((roadmap.slug || 'roadmap').replace(/^custom:/, 'custom-'));
    const targetDir = path.join(vaultDir, safeSlug);
    fs.mkdirSync(targetDir, { recursive: true });

    const interactiveNodes = (roadmap.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );

    const progress = nodeProgress[roadmap.slug] || {};
    let doneCount = 0;
    let learningCount = 0;
    let skippedCount = 0;

    const checklistItems = [];

    for (const node of interactiveNodes) {
      const label = String(node.data?.label || node.id).trim();
      const status = progress[node.id] || null;
      let checkMark = ' ';
      if (status === 'done') {
        checkMark = 'x';
        doneCount++;
      } else if (status === 'learning') {
        checkMark = '/'; // Obsidian in-progress mark
        learningCount++;
      } else if (status === 'skipped') {
        checkMark = '-'; // Obsidian strike/skipped mark
        skippedCount++;
      }

      // Obsidian wikilink [[Safe Topic Name]]
      const safeLabel = sanitizeFilename(label, `topic-${node.id}`);
      checklistItems.push(`- [${checkMark}] [[${safeLabel}]]${status ? ` *(${status})*` : ''}`);
    }

    const pct = interactiveNodes.length ? Math.round((doneCount / interactiveNodes.length) * 100) : 0;
    const title = roadmap.title?.page || roadmap.title?.card || roadmap.title || roadmap.slug;

    const frontmatter = {
      title,
      roadmap: roadmap.slug,
      totalTopics: interactiveNodes.length,
      done: doneCount,
      learning: learningCount,
      skipped: skippedCount,
      percentage: pct,
      updated: new Date().toISOString(),
      tags: ['roadmap', 'overview', sanitizeFilename(safeSlug)],
    };

    const body = [
      `# ${title} Roadmap`,
      '',
      `> **Progress:** ${doneCount} / ${interactiveNodes.length} topics completed (${pct}%)`,
      `> **Status:** ${doneCount === interactiveNodes.length && interactiveNodes.length > 0 ? 'Completed 🎉' : `${learningCount} in progress`}`,
      '',
      '## Topics Checklist',
      '',
      checklistItems.length ? checklistItems.join('\n') : '*No topic nodes defined yet.*',
      '',
      '---',
      '*Synced automatically by Skill Trail*',
    ].join('\n');

    const fileContent = formatMarkdownWithFrontmatter(frontmatter, body);
    const targetFile = path.join(targetDir, '_overview.md');
    fs.writeFileSync(targetFile, fileContent, 'utf8');
    return targetFile;
  } catch (err) {
    console.error(`[vault] Error writing overview for ${roadmap.slug}:`, err.message);
    return null;
  }
}

/**
 * Scan the vault directory and synchronize external changes into state.json.
 * Updates both notes and nodeProgress if frontmatter status or body changed.
 */
export function syncFromVault(getAllRoadmapsFn) {
  const config = getVaultConfig();
  if (!fs.existsSync(config.path)) {
    fs.mkdirSync(config.path, { recursive: true });
  }

  const allRoadmaps = getAllRoadmapsFn();
  const roadmapsBySlug = new Map(allRoadmaps.map((r) => [r.slug, r]));

  let notesUpdated = 0;
  let progressUpdated = 0;
  let filesScanned = 0;

  mutateState((state) => {
    state.nodeNotes = state.nodeNotes || {};
    state.nodeProgress = state.nodeProgress || {};

    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue; // skip .obsidian etc.
        const full = path.join(dir, ent.name);

        if (ent.isDirectory()) {
          scanDir(full);
        } else if (ent.isFile() && ent.name.endsWith('.md')) {
          filesScanned++;
          if (ent.name === '_overview.md') {
            continue;
          }

          try {
            const raw = fs.readFileSync(full, 'utf8');
            const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);

            const slug = frontmatter.roadmap;
            const nodeId = frontmatter.nodeId;
            if (!slug || !nodeId) continue;

            // 1. Sync status from frontmatter
            if (frontmatter.status && ['done', 'learning', 'skipped'].includes(frontmatter.status)) {
              state.nodeProgress[slug] = state.nodeProgress[slug] || {};
              const currentStatus = state.nodeProgress[slug][nodeId] || null;
              if (currentStatus !== frontmatter.status) {
                state.nodeProgress[slug][nodeId] = frontmatter.status;
                progressUpdated++;
              }
            } else if (frontmatter.status === 'unstarted' || frontmatter.status === 'none') {
              if (state.nodeProgress[slug]?.[nodeId]) {
                delete state.nodeProgress[slug][nodeId];
                progressUpdated++;
              }
            }

            // 2. Extract note body (strip title header and placeholder comment)
            let noteText = body
              .replace(/^#\s+[^\n]+\r?\n/, '') // remove top H1
              .replace(/<!--\s*notes-empty\s*-->[\s\S]*$/, '') // remove empty placeholder if untouched
              .trim();

            if (noteText) {
              state.nodeNotes[slug] = state.nodeNotes[slug] || {};
              const currentNote = state.nodeNotes[slug][nodeId] || '';
              if (currentNote !== noteText) {
                state.nodeNotes[slug][nodeId] = noteText;
                notesUpdated++;
              }
            }
          } catch (err) {
            console.error(`[vault] Failed to parse ${full}:`, err.message);
          }
        }
      }
    }

    scanDir(config.path);

    // Update lastSyncedAt
    state.settings = state.settings || {};
    state.settings.vault = state.settings.vault || {};
    state.settings.vault.lastSyncedAt = new Date().toISOString();
  });

  return {
    ok: true,
    filesScanned,
    notesUpdated,
    progressUpdated,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Bulk export all roadmaps, topics, and existing notes into the vault.
 */
export function exportAllToVault(getAllRoadmapsFn, findNodeContentFn) {
  const config = getVaultConfig();
  const vaultDir = config.path;
  fs.mkdirSync(vaultDir, { recursive: true });

  const state = loadState();
  const allRoadmaps = getAllRoadmapsFn();

  let exportedNotes = 0;
  let exportedOverviews = 0;

  for (const rm of allRoadmaps) {
    const slug = rm.slug;
    const progress = state.nodeProgress || {};
    const notes = state.nodeNotes?.[slug] || {};

    const interactiveNodes = (rm.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );

    for (const node of interactiveNodes) {
      const label = String(node.data?.label || node.id).trim();
      const userNote = notes[node.id] || null;
      const status = progress[slug]?.[node.id] || null;
      const official = findNodeContentFn ? findNodeContentFn(slug, node.id) : null;

      writeTopicNoteToVault(slug, node.id, label, userNote, status, official);
      exportedNotes++;
    }

    writeRoadmapOverview(vaultDir, rm, progress);
    exportedOverviews++;
  }

  mutateState((s) => {
    s.settings = s.settings || {};
    s.settings.vault = s.settings.vault || {};
    s.settings.vault.lastSyncedAt = new Date().toISOString();
  });

  return {
    ok: true,
    vaultDir,
    exportedNotes,
    exportedOverviews,
    totalRoadmaps: allRoadmaps.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Optional Live Watcher: watches the vault folder for external edits.
 */
let vaultWatcher = null;

export function startVaultWatcher(getAllRoadmapsFn) {
  if (vaultWatcher) {
    try {
      vaultWatcher.close();
    } catch {}
    vaultWatcher = null;
  }

  const config = getVaultConfig();
  if (!config.enabled || !config.autoWatch || !fs.existsSync(config.path)) {
    return;
  }

  let debounceTimer = null;

  try {
    vaultWatcher = fs.watch(config.path, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          syncFromVault(getAllRoadmapsFn);
        } catch (err) {
          console.error('[vault-watcher] Auto-sync error:', err.message);
        }
      }, 800);
    });
    console.log(`[vault] File watcher active on ${config.path}`);
  } catch (err) {
    console.warn(`[vault] Could not start file watcher:`, err.message);
  }
}
