/**
 * Minimal, dependency-free test harness.
 *
 * The app deliberately ships almost no dependencies, so pulling in a test
 * framework for this would be out of character. esbuild is already present via
 * Vite, so tests are plain TypeScript bundled by `scripts/run-tests.mjs` and
 * executed by Node.
 */

export interface Failure {
  suite: string;
  name: string;
  error: string;
}

const failures: Failure[] = [];
const suiteStack: string[] = [];
let passed = 0;

/** Stacks of before/after hooks, one slot per describe currently in scope. */
const beforeEachStack: ((() => void | Promise<void>) | undefined)[] = [];
const afterEachStack: ((() => void | Promise<void>) | undefined)[] = [];

const suitePath = () => suiteStack.join(' › ') || 'root';

export function describe(name: string, fn: () => void): void {
  suiteStack.push(name);
  beforeEachStack.push(undefined);
  afterEachStack.push(undefined);
  try {
    fn();
  } finally {
    suiteStack.pop();
    beforeEachStack.pop();
    afterEachStack.pop();
  }
}

/** Run after each `it()` inside the current describe. Async fns are awaited. */
export function afterEach(fn: () => void | Promise<void>): void {
  afterEachStack[afterEachStack.length - 1] = fn;
}

/** Run before each `it()` inside the current describe. Async fns are awaited. */
export function beforeEach(fn: () => void | Promise<void>): void {
  beforeEachStack[beforeEachStack.length - 1] = fn;
}

interface Entry {
  suite: string;
  name: string;
  fn: () => void | Promise<void>;
  /** Snapshotted at registration — the live stacks are empty by run time. */
  before: (() => void | Promise<void>)[];
  after: (() => void | Promise<void>)[];
}

const entries: Entry[] = [];

/**
 * Register a test. `fn` may be async (connectors touch disk and network).
 *
 * Note the suite is captured here, not at run time — tests are queued and run
 * sequentially by settle(), so suitePath() would be meaningless by then.
 */
export function it(name: string, fn: () => void | Promise<void>): void {
  entries.push({
    suite: suitePath(),
    name,
    fn,
    before: [...beforeEachStack].filter((f): f is () => void | Promise<void> => !!f),
    after: [...afterEachStack].filter((f): f is () => void | Promise<void> => !!f),
  });
}

/**
 * Run every registered test, one at a time, then await the results.
 *
 * Sequential on purpose: async tests share mutable state (the connector config
 * file), and starting them all at once made them race and clobber each other.
 */
export async function settle(): Promise<void> {
  for (const e of entries) {
    for (const be of e.before) {
      try {
        await be();
      } catch (err) {
        failures.push({ suite: e.suite, name: e.name, error: `(beforeEach) ${(err as Error)?.message ?? String(err)}` });
      }
    }
    try {
      await e.fn();
      passed++;
    } catch (err) {
      failures.push({
        suite: e.suite,
        name: e.name,
        error: (err as Error)?.message ?? String(err),
      });
    }
    for (const ae of e.after) {
      try {
        await ae();
      } catch (err) {
        failures.push({ suite: e.suite, name: e.name, error: `(afterEach) ${(err as Error)?.message ?? String(err)}` });
      }
    }
  }
}

export function assert(cond: unknown, msg = 'expected truthy value'): void {
  if (!cond) throw new Error(msg);
}

export function eq<T>(actual: T, expected: T, msg = ''): void {
  if (actual !== expected) {
    throw new Error(
      `${msg}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`,
    );
  }
}

export function near(actual: number, expected: number, tol = 0.01, msg = ''): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `${msg}\n      expected: ${expected} (±${tol})\n      actual:   ${actual}`,
    );
  }
}

export function deepEq(actual: unknown, expected: unknown, msg = ''): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg}\n      expected: ${b}\n      actual:   ${a}`);
}

export function throws(fn: () => unknown, msg = 'expected function to throw'): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg);
}

export function summary(): { passed: number; failed: number; failures: Failure[] } {
  return { passed, failed: failures.length, failures };
}
