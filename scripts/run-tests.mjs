#!/usr/bin/env node
/**
 * Run the test suite.
 *
 * There is no test framework: esbuild (already present in app/node_modules via
 * Vite) bundles the TypeScript tests into one ESM file and Node executes it.
 * Node built-ins stay external so `fs`/`path` behave normally, and DATA_DIR is
 * pointed at a scratch directory so the suite can never touch real state.
 *
 * Usage:  npm test
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'tests', 'suite.test.ts');

// esbuild lives with Vite under app/, not at the repo root.
const require = createRequire(join(ROOT, 'app', 'package.json'));
const { build } = require('esbuild');

// Scratch DATA_DIR: store.js reads it at import time and must never see the
// user's real state.json.
const scratch = mkdtempSync(join(tmpdir(), 'roadmap-tests-'));
mkdirSync(join(scratch, 'roadmaps'), { recursive: true });
writeFileSync(join(scratch, 'state.json'), '{}');
process.env.DATA_DIR = scratch;

const outFile = join(scratch, 'bundle.mjs');

try {
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: outFile,
    external: ['node:*'],
    logLevel: 'error',
  });

  const mod = await import(pathToFileURL(outFile).href);
  await mod.settle?.(); // tests may be async
  const { passed, failed, failures } = mod.default();

  for (const f of failures) {
    console.error(`\n  ✗ ${f.suite} › ${f.name}`);
    console.error(`      ${f.error.split('\n').join('\n      ')}`);
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
