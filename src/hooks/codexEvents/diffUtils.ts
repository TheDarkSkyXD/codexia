import type { MutableRefObject } from 'react';

import {
  collectDiffForPaths,
  snapshotWorktreeSummary,
  type DiffTargetPayload,
  type TrackedDiffEntry,
  type WorktreeSummary,
} from '@/services/diffService';
import { normalizeDiffPath, useEphemeralStore } from '@/stores/EphemeralStore';

export interface SnapshotState {
  promise: Promise<WorktreeSummary | null> | null;
  snapshot: WorktreeSummary | null;
}

const ensureSnapshotState = (
  ref: MutableRefObject<SnapshotState | null>,
): SnapshotState => {
  if (!ref.current) {
    ref.current = { promise: null, snapshot: null };
  }
  return ref.current;
};

export const beginWorktreeSnapshot = (
  sessionId: string,
  ref: MutableRefObject<SnapshotState | null>,
) => {
  if (!sessionId) return;
  const state = ensureSnapshotState(ref);
  const promise = snapshotWorktreeSummary(sessionId);
  state.promise = promise;
  state.snapshot = null;
  promise
    .then((summary) => {
      const current = ref.current;
      if (current && current.promise === promise) {
        current.snapshot = summary;
        current.promise = null;
      }
    })
    .catch((error) => {
      console.error('Failed to capture worktree snapshot', error);
      const current = ref.current;
      if (current && current.promise === promise) {
        current.snapshot = null;
        current.promise = null;
      }
    });
};

export const resolveSnapshot = async (
  sessionId: string,
  ref: MutableRefObject<SnapshotState | null>,
): Promise<WorktreeSummary | null> => {
  const state = ensureSnapshotState(ref);
  if (state.snapshot) {
    return state.snapshot;
  }
  if (state.promise) {
    try {
      const summary = await state.promise;
      const current = ref.current;
      if (current && current.promise === null) {
        return current.snapshot;
      }
      if (current && current.promise === state.promise) {
        current.snapshot = summary;
        current.promise = null;
      }
      return summary ?? null;
    } catch (error) {
      console.error(`Snapshot promise failed for session ${sessionId}`, error);
      return null;
    }
  }
  const fresh = await snapshotWorktreeSummary(sessionId);
  const current = ensureSnapshotState(ref);
  current.snapshot = fresh;
  current.promise = null;
  return fresh;
};

const normalizePath = (path?: string | null): string | null => {
  if (!path) return null;
  return normalizeDiffPath(path) ?? path;
};

const recordEntry = (
  entry: TrackedDiffEntry,
  scope: Set<string>,
  targets: DiffTargetPayload[],
  afterTrackedSet: Set<string>,
) => {
  const norm = normalizePath(entry.path);
  if (norm) {
    scope.add(norm);
    afterTrackedSet.add(norm);
  }
  const oldNorm = normalizePath(entry.oldPath ?? undefined);
  if (oldNorm) {
    scope.add(oldNorm);
    afterTrackedSet.add(oldNorm);
  }
  targets.push({
    path: entry.path,
    status: entry.status,
    oldPath: entry.oldPath ?? undefined,
  });
};

const normalizeCollection = (paths?: string[] | null) => {
  const set = new Set<string>();
  (paths ?? []).forEach((path) => {
    const norm = normalizePath(path);
    if (norm) {
      set.add(norm);
    }
  });
  return set;
};

interface ChangeComputationResult {
  targets: DiffTargetPayload[];
  scopePaths: string[];
}

const computeChangedTargets = (
  before: WorktreeSummary | null,
  after: WorktreeSummary | null,
): ChangeComputationResult => {
  const targets: DiffTargetPayload[] = [];
  const scope = new Set<string>();
  const afterTrackedSet = new Set<string>();

  after?.tracked.forEach((entry) => recordEntry(entry, scope, targets, afterTrackedSet));

  const afterUntrackedSet = normalizeCollection(after?.untracked);
  afterUntrackedSet.forEach((path) => {
    scope.add(path);
    targets.push({ path, status: '??' });
  });

  const beforeTrackedSet = new Set<string>();
  before?.tracked.forEach((entry) => {
    const norm = normalizePath(entry.path);
    if (norm) {
      beforeTrackedSet.add(norm);
      if (!afterTrackedSet.has(norm)) {
        scope.add(norm);
      }
    }
    const oldNorm = normalizePath(entry.oldPath ?? undefined);
    if (oldNorm) {
      beforeTrackedSet.add(oldNorm);
      if (!afterTrackedSet.has(oldNorm)) {
        scope.add(oldNorm);
      }
    }
  });

  const beforeUntrackedSet = normalizeCollection(before?.untracked);
  beforeUntrackedSet.forEach((path) => {
    if (!afterUntrackedSet.has(path)) {
      scope.add(path);
    }
  });

  if (targets.length === 0 && scope.size === 0) {
    return { targets: [], scopePaths: [] };
  }

  return { targets, scopePaths: [...scope] };
};

export const applyWorktreeDiffUpdate = async (
  sessionId: string,
  before: WorktreeSummary | null,
  after: WorktreeSummary | null,
) => {
  if (!sessionId) {
    return;
  }

  const { targets, scopePaths } = computeChangedTargets(before, after);
  if (!scopePaths.length) {
    return;
  }

  let diffText = '';
  if (targets.length) {
    diffText = await collectDiffForPaths(sessionId, targets);
  }

  useEphemeralStore.getState().updateTurnDiffEntries(sessionId, diffText, scopePaths);
};
