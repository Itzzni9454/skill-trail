/**
 * React hook backing the cross-roadmap "covered" feature. Fetches done-topic
 * labels + the roadmaps that contain them, then derives a display progress map
 * in which topics done in ANY OTHER roadmap show as 'covered' in the current
 * one. Local status always wins over covered.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { coveredStatusMap, doneElsewhereFor } from './cross';
import type { NodeStatus, ProgressMap, Roadmap } from './types';

export function useCrossProgress(
  slug: string,
  roadmap: Roadmap | null,
  localProgress: ProgressMap,
  /** When false, covered display is suppressed entirely (display only — the
   *  toggle never changes stored progress). Undefined = read the setting. */
  countCovered?: boolean,
) {
  /** slug -> done-topic labels (from /api/cross-progress). */
  const [doneLabelsBySlug, setDoneLabelsBySlug] = useState<Record<string, string[]>>({});
  /** Full progress across all roadmaps (for matching + "covered by" hints). */
  const [allProgress, setAllProgress] = useState<Record<string, Record<string, NodeStatus>>>({});
  /** Other roadmaps that actually have done topics — loaded lazily. */
  const [otherRoadmaps, setOtherRoadmaps] = useState<Map<string, Roadmap>>(new Map());
  /** Server setting, fetched unless the caller pins the toggle explicitly. */
  const [settingEnabled, setSettingEnabled] = useState<boolean | null>(null);
  /** Resolved toggle: explicit argument wins, then the setting, then on. */
  const effectiveCount = countCovered ?? settingEnabled ?? true;

  /** Re-fetch coverage inputs; call after any status change. */
  const refreshCoverage = useCallback(() => {
    api
      .getProgress()
      .then((p) => setAllProgress((p.nodeProgress || {}) as Record<string, Record<string, NodeStatus>>))
      .catch(() => {});
    api
      .getCrossProgress()
      .then((r) => setDoneLabelsBySlug(r.doneLabelsBySlug || {}))
      .catch(() => {});
  }, []);

  // Resolve the toggle from settings when the caller didn't pass one.
  useEffect(() => {
    if (countCovered !== undefined) return;
    api
      .getSettings()
      .then((s) => setSettingEnabled(s.countCoveredAsDone))
      .catch(() => setSettingEnabled(true));
  }, [countCovered]);

  useEffect(() => {
    refreshCoverage();
  }, [refreshCoverage]);

  // Load the other roadmaps that contain done topics (labels needed for
  // matching). Re-runs when the set of slugs with done topics changes.
  useEffect(() => {
    let cancelled = false;
    const withDone = Object.keys(doneLabelsBySlug).filter((s) => s && s !== slug);
    if (withDone.length === 0) {
      setOtherRoadmaps(new Map());
      return;
    }
    Promise.all(withDone.map((s) => api.getRoadmap(s).catch(() => null))).then((rms) => {
      if (cancelled) return;
      const m = new Map<string, Roadmap>();
      rms.forEach((rm) => {
        if (rm?.slug) m.set(rm.slug, rm);
      });
      setOtherRoadmaps(m);
    });
    return () => {
      cancelled = true;
    };
  }, [doneLabelsBySlug, slug]);

  /** Current roadmap + every other roadmap involved in coverage matching. */
  const allRoadmapsMap = useMemo(() => {
    const m = new Map(otherRoadmaps);
    if (roadmap) m.set(slug, roadmap);
    return m;
  }, [otherRoadmaps, roadmap, slug]);

  /**
   * Display progress = real progress overlaid with "covered". Local status
   * always wins; the settings toggle can suppress covered entirely.
   */
  const displayProgress = useMemo<ProgressMap>(() => {
    if (!roadmap) return localProgress;
    if (!effectiveCount) return localProgress;
    const covered = coveredStatusMap(slug, allRoadmapsMap, allProgress);
    return { ...covered, ...localProgress };
  }, [roadmap, slug, allRoadmapsMap, allProgress, localProgress, effectiveCount]);

  /** Other roadmaps where this label is done — for popup "covered by" hints. */
  const coveredBy = useCallback(
    (label?: string) => (label ? doneElsewhereFor(label, slug, allRoadmapsMap, allProgress) : []),
    [slug, allRoadmapsMap, allProgress],
  );

  return { displayProgress, coveredBy, refreshCoverage, effectiveCount };
}
