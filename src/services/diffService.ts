import { invoke } from '@tauri-apps/api/core';

const normalizeSessionId = (sessionId: string): string => {
  if (sessionId.startsWith('codex-event-')) {
    return sessionId.replace('codex-event-', '');
  }
  return sessionId;
};

export async function revertFileDiff(sessionId: string, diffPatch: string): Promise<void> {
  const hasContent = diffPatch.trim().length > 0;
  if (!hasContent) {
    return;
  }

  const normalizedPatch = diffPatch.endsWith('\n') ? diffPatch : `${diffPatch}\n`;

  await invoke('revert_file_diff', {
    sessionId: normalizeSessionId(sessionId),
    diffPatch: normalizedPatch,
  });
}

export async function fetchSessionDiff(sessionId: string): Promise<string> {
  if (!sessionId) {
    return '';
  }

  try {
    const result = await invoke<string>('collect_worktree_diff', {
      sessionId: normalizeSessionId(sessionId),
    });
    return typeof result === 'string' ? result : '';
  } catch (error) {
    console.error('Failed to fetch worktree diff', error);
    return '';
  }
}

export async function snapshotWorktreeSummary(
  sessionId: string,
): Promise<WorktreeSummary | null> {
  if (!sessionId) {
    return null;
  }

  try {
    const result = await invoke<WorktreeSummary>('snapshot_worktree_summary', {
      sessionId: normalizeSessionId(sessionId),
    });
    return result;
  } catch (error) {
    console.error('Failed to snapshot worktree summary', error);
    return null;
  }
}

export async function collectDiffForPaths(
  sessionId: string,
  targets: DiffTargetPayload[],
): Promise<string> {
  if (!sessionId || !targets.length) {
    return '';
  }

  try {
    const result = await invoke<string>('collect_worktree_diff_subset', {
      sessionId: normalizeSessionId(sessionId),
      targets,
    });
    return typeof result === 'string' ? result : '';
  } catch (error) {
    console.error('Failed to collect diff for paths', error);
    return '';
  }
}
export interface TrackedDiffEntry {
  status: string;
  path: string;
  oldPath?: string | null;
}

export interface WorktreeSummary {
  tracked: TrackedDiffEntry[];
  untracked: string[];
}

export interface DiffTargetPayload {
  path: string;
  status: string;
  oldPath?: string | null;
}
