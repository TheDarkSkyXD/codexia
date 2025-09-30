import React, { useMemo, useState } from "react";
import { DiffViewer } from "@/components/filetree/DiffViewer";
import { DiffEntry } from "@/stores/EphemeralStore";

interface ChangesSummaryProps {
  // sessionId -> filePath map resolved upstream; we only need one session's map
  diffs?: Record<string, DiffEntry>;
}

// Compact latest changes summary + collapsible unified diffs per file
export const ChangesSummary: React.FC<ChangesSummaryProps> = ({ diffs }) => {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const parsedFiles = useMemo(() => {
    const out: { file: string; unified: string; hunk?: string; updatedAt: number }[] = [];
    const map = diffs || {};
    for (const [fileKey, obj] of Object.entries(map)) {
      const unified = obj.unified;
      const hunk = unified.split('\n').find((l) => l.startsWith('@@')) || undefined;
      const display = obj.displayPath || fileKey;
      out.push({ file: display, unified, hunk, updatedAt: obj.updatedAt });
    }
    // Recent first
    out.sort((a, b) => (b.updatedAt - a.updatedAt));
    return out;
  }, [diffs]);

  if (!parsedFiles.length) return null;

  return (
    <div className="px-2 pb-1 space-y-1">
      <div className="flex flex-col gap-1">
        {parsedFiles.map(({ file, hunk, unified }) => {
          const expanded = !!expandedFiles[file];
          return (
            <div key={file} className="rounded border border-border bg-accent/20">
              <button
                className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:bg-accent/30"
                onClick={() => setExpandedFiles((prev) => ({ ...prev, [file]: !prev[file] }))}
              >
                <span className="font-mono">{file}</span>
                {hunk && (
                  <span className="ml-2 text-muted-foreground/80">{hunk}</span>
                )}
                <span className="float-right opacity-70">{expanded ? 'Hide' : 'Show'}</span>
              </button>
              {expanded && (
                <div className="border-t border-border">
                  <DiffViewer unifiedDiff={unified} fileName={file} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
