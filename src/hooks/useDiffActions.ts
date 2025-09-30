import { useCallback } from 'react';
import { toast } from 'sonner';

import { revertFileDiff } from '@/services/diffService';
import { DiffEntry, useEphemeralStore } from '@/stores/EphemeralStore';

const EMPTY_PENDING: Record<string, boolean> = Object.freeze({});

export const useDiffActions = (sessionId?: string) => {
  const pendingRestores = useEphemeralStore(
    useCallback(
      (state) => {
        if (!sessionId) {
          return EMPTY_PENDING;
        }
        return state.pendingRestores[sessionId] ?? EMPTY_PENDING;
      },
      [sessionId],
    ),
  );

  const setPending = useEphemeralStore((state) => state.setDiffRestorePending);
  const removeDiffEntry = useEphemeralStore((state) => state.removeTurnDiffEntry);

  const restoreDiff = useCallback(
    async (diffKey: string, entry: DiffEntry): Promise<boolean> => {
      if (!sessionId) {
        toast.error('Cannot restore change: missing session context.');
        return false;
      }

      setPending(sessionId, diffKey, true);
      try {
        await revertFileDiff(sessionId, entry.unified);
        removeDiffEntry(sessionId, diffKey);

        toast.success('Restored change', {
          description: entry.displayPath,
        });
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'Unknown error');
        toast.error('Failed to restore change', {
          description: message,
        });
        return false;
      } finally {
        setPending(sessionId, diffKey, false);
      }
    },
    [sessionId, setPending, removeDiffEntry],
  );

  return {
    pendingRestores,
    restoreDiff,
  };
};
