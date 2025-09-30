import { create } from 'zustand';

export type DiffChangeType = 'add' | 'delete' | 'modify' | 'rename';

export interface DiffEntry {
  unified: string;
  updatedAt: number;
  displayPath: string;
  changeType: DiffChangeType;
  oldPath?: string;
  newPath?: string;
}

interface TokenCountShape {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens: number;
}

interface EphemeralStoreState {
  sessionFileDiffs: Record<string, Record<string, DiffEntry>>;
  pendingRestores: Record<string, Record<string, boolean>>;
  sessionTokenUsage: Record<string, TokenCountShape | undefined>;
  setTurnDiff: (sessionId: string, unifiedDiff: string) => void;
  clearTurnDiffs: (sessionId: string) => void;
  setSessionTokenUsage: (sessionId: string, usage?: TokenCountShape) => void;
  setDiffRestorePending: (sessionId: string, diffKey: string, pending: boolean) => void;
  updateTurnDiffEntries: (
    sessionId: string,
    diffText: string,
    scopePaths?: string[],
  ) => void;
  removeTurnDiffEntry: (sessionId: string, diffKey: string) => void;
}

export const normalizeDiffPath = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '/dev/null') return null;
  const withoutPrefix = trimmed.replace(/^a\//, '').replace(/^b\//, '');
  if (withoutPrefix === '/dev/null' || withoutPrefix === 'dev/null') {
    return null;
  }
  return withoutPrefix;
};

const determineChangeType = (oldPath?: string | null, newPath?: string | null): DiffChangeType => {
  const oldNorm = normalizeDiffPath(oldPath);
  const newNorm = normalizeDiffPath(newPath);
  if (!oldNorm && newNorm) return 'add';
  if (oldNorm && !newNorm) return 'delete';
  if (oldNorm && newNorm && oldNorm !== newNorm) return 'rename';
  return 'modify';
};

const resolveDisplayPath = (
  changeType: DiffChangeType,
  oldPath?: string | null,
  newPath?: string | null,
): string => {
  const oldNorm = normalizeDiffPath(oldPath);
  const newNorm = normalizeDiffPath(newPath);
  switch (changeType) {
    case 'add':
      return newNorm ?? '(new file)';
    case 'delete':
      return oldNorm ?? '(deleted file)';
    case 'rename':
      return oldNorm && newNorm ? `${oldNorm} → ${newNorm}` : newNorm ?? oldNorm ?? '(renamed file)';
    default:
      return newNorm ?? oldNorm ?? '(modified file)';
  }
};

const buildDiffMap = (diffText: string, timestamp: number): Record<string, DiffEntry> => {
  const map: Record<string, DiffEntry> = {};
  const normalized = diffText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let blockLines: string[] = [];
  let currentOld: string | null = null;
  let currentNew: string | null = null;

  const commitBlock = () => {
    const joined = blockLines.join('\n');
    if (!joined.trim()) {
      blockLines = [];
      currentOld = null;
      currentNew = null;
      return;
    }

    const changeType = determineChangeType(currentOld, currentNew);
    const displayPath = resolveDisplayPath(changeType, currentOld, currentNew);
    const keySource = normalizeDiffPath(currentNew) ?? normalizeDiffPath(currentOld);
    if (!keySource) {
      blockLines = [];
      currentOld = null;
      currentNew = null;
      return;
    }

    const normalizedContent = joined.endsWith('\n') ? joined : `${joined}\n`;

    map[keySource] = {
      unified: normalizedContent,
      updatedAt: timestamp,
      displayPath,
      changeType,
      oldPath: normalizeDiffPath(currentOld) ?? undefined,
      newPath: normalizeDiffPath(currentNew) ?? undefined,
    };

    blockLines = [];
    currentOld = null;
    currentNew = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      commitBlock();
      blockLines = [line];
      continue;
    }

    if (line.startsWith('--- ')) {
      blockLines.push(line);
      currentOld = line.slice(4).trim();
      continue;
    }

    if (line.startsWith('+++ ')) {
      blockLines.push(line);
      currentNew = line.slice(4).trim();
      continue;
    }

    blockLines.push(line);
  }

  commitBlock();
  return map;
};

export const useEphemeralStore = create<EphemeralStoreState>((set) => ({
  sessionFileDiffs: {},
  pendingRestores: {},
  sessionTokenUsage: {},
  setTurnDiff: (sessionId, unifiedDiff) =>
    set((state) => {
      const diffText = unifiedDiff ?? '';
      const timestamp = Date.now();
      const entries = diffText.trim()
        ? buildDiffMap(diffText, timestamp)
        : {};

      const sessionFileDiffs = { ...state.sessionFileDiffs };
      if (Object.keys(entries).length) {
        sessionFileDiffs[sessionId] = entries;
      } else {
        delete sessionFileDiffs[sessionId];
      }

      const pendingRestores = { ...state.pendingRestores };
      delete pendingRestores[sessionId];

      return {
        sessionFileDiffs,
        pendingRestores,
      };
    }),
  clearTurnDiffs: (sessionId) =>
    set((state) => {
      const nextDiffs = { ...state.sessionFileDiffs };
      delete nextDiffs[sessionId];

      const nextPending = { ...state.pendingRestores };
      delete nextPending[sessionId];

      return { sessionFileDiffs: nextDiffs, pendingRestores: nextPending };
    }),
  setSessionTokenUsage: (sessionId, usage) =>
    set((state) => ({
      sessionTokenUsage: { ...state.sessionTokenUsage, [sessionId]: usage },
    })),
  setDiffRestorePending: (sessionId, diffKey, pending) =>
    set((state) => {
      const sessionPending = { ...(state.pendingRestores[sessionId] || {}) };
      if (pending) {
        sessionPending[diffKey] = true;
      } else {
        delete sessionPending[diffKey];
      }
      return {
        pendingRestores: {
          ...state.pendingRestores,
          [sessionId]: sessionPending,
        },
      };
    }),
  updateTurnDiffEntries: (sessionId, diffText, scopePaths) =>
    set((state) => {
      const timestamp = Date.now();
      const entries = diffText.trim()
        ? buildDiffMap(diffText, timestamp)
        : {};

      const prevDiffs = state.sessionFileDiffs[sessionId] || {};
      const nextDiffsForSession = { ...prevDiffs };
      const scopeSet = scopePaths
        ? new Set(
            scopePaths
              .map((p) => normalizeDiffPath(p))
              .filter((p): p is string => !!p),
          )
        : null;

      if (scopeSet) {
        for (const key of scopeSet) {
          delete nextDiffsForSession[key];
        }
      } else {
        for (const key of Object.keys(nextDiffsForSession)) {
          delete nextDiffsForSession[key];
        }
      }

      for (const [key, entry] of Object.entries(entries)) {
        nextDiffsForSession[key] = entry;
      }

      const sessionFileDiffs = { ...state.sessionFileDiffs };
      if (Object.keys(nextDiffsForSession).length) {
        sessionFileDiffs[sessionId] = nextDiffsForSession;
      } else {
        delete sessionFileDiffs[sessionId];
      }

      const nextPending = { ...state.pendingRestores };
      if (scopeSet) {
        const pendingMap = { ...(nextPending[sessionId] || {}) };
        for (const key of scopeSet) {
          delete pendingMap[key];
        }
        if (Object.keys(pendingMap).length) {
          nextPending[sessionId] = pendingMap;
        } else {
          delete nextPending[sessionId];
        }
      } else {
        delete nextPending[sessionId];
      }

      return {
        sessionFileDiffs,
        pendingRestores: nextPending,
      };
    }),
  removeTurnDiffEntry: (sessionId, diffKey) =>
    set((state) => {
      const diffMap = { ...(state.sessionFileDiffs[sessionId] || {}) };
      delete diffMap[diffKey];

      const pendingMap = { ...(state.pendingRestores[sessionId] || {}) };
      delete pendingMap[diffKey];

      const nextDiffs = { ...state.sessionFileDiffs };
      if (Object.keys(diffMap).length) {
        nextDiffs[sessionId] = diffMap;
      } else {
        delete nextDiffs[sessionId];
      }

      const nextPending = { ...state.pendingRestores };
      if (Object.keys(pendingMap).length) {
        nextPending[sessionId] = pendingMap;
      } else {
        delete nextPending[sessionId];
      }

      return {
        sessionFileDiffs: nextDiffs,
        pendingRestores: nextPending,
      };
    }),
}));
