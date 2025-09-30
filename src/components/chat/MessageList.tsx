import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Layers,
  Zap,
  SlidersHorizontal,
  LayoutDashboard,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/types/chat";
import type { ApprovalRequest } from "@/types/codex";
import { TextSelectionMenu } from "./TextSelectionMenu";
import { Message } from "./Message";
import { useTextSelection } from "../../hooks/useTextSelection";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Link } from "react-router-dom";
import { DiffViewer } from "@/components/filetree/DiffViewer";
import { useDiffActions } from "@/hooks/useDiffActions";
import { DiffEntry } from "@/stores/EphemeralStore";
// Note: No external links or logos in empty state; show key features instead.

// Unified message type
type UnifiedMessage = ChatMessageType;

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
}

interface MessageListProps {
  messages: UnifiedMessage[];
  className?: string;
  isLoading?: boolean;
  isPendingNewConversation?: boolean;
  onApproval?: (approved: boolean, approvalRequest: ApprovalRequest) => void;
  tokenUsage?: TokenUsage;
  sessionId?: string;
  model?: string;
  fileDiffs?: Record<string, DiffEntry>;
}

export function MessageList({
  messages,
  className = "",
  isLoading = false,
  onApproval,
  sessionId,
  fileDiffs,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>(
    {},
  );
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const copyResetTimeout = useRef<number | null>(null);
  const { selectedText } = useTextSelection();
  const { pendingRestores, restoreDiff } = useDiffActions(sessionId);
  // Four feature cards based on README.md
  const features = [
    {
      title: "Multi-Session",
      description: "Run multiple sessions with persistent restoration.",
      icon: Layers,
    },
    {
      title: "Streaming",
      description: "Live responses as they generate for instant feedback.",
      icon: Zap,
    },
    {
      title: "Configuration",
      description: "Providers, models, sandbox modes, approvals, and more.",
      icon: SlidersHorizontal,
    },
    {
      title: "Polished UX",
      description: "Notepad, Markdown, Plan/Todo, Themes, WebPreview.",
      icon: LayoutDashboard,
    },
  ] as const;

  const turnDiffEntries = useMemo(() => {
    if (!fileDiffs) return [];

    const entries = Object.entries(fileDiffs).map(([fileKey, payload]) => {
      const unified = payload.unified || "";
      let additions = 0;
      let deletions = 0;

      unified.split("\n").forEach((line) => {
        if (!line) return;
        if (
          line.startsWith("+++ ") ||
          line.startsWith("--- ") ||
          line.startsWith("@@") ||
          line.startsWith("diff --git") ||
          line.startsWith("index ")
        ) {
          return;
        }
        if (line.startsWith("\\ No newline")) {
          return;
        }
        if (line.startsWith("+")) {
          additions += 1;
          return;
        }
        if (line.startsWith("-")) {
          deletions += 1;
        }
      });

      const filePath = payload.displayPath || fileKey.replace(/^([ab]\/)*/, "");

      return {
        key: fileKey,
        filePath,
        additions,
        deletions,
        unified,
        updatedAt: payload.updatedAt || 0,
        entry: payload,
      };
    });

    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }, [fileDiffs]);

  const hasTurnDiffs = turnDiffEntries.length > 0;

  useEffect(() => {
    if (copyResetTimeout.current) {
      window.clearTimeout(copyResetTimeout.current);
      copyResetTimeout.current = null;
    }
    setCopiedFile(null);
    setExpandedDiffs({});
  }, [fileDiffs]);

  useEffect(() => {
    return () => {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
    };
  }, []);

  const toggleDiff = useCallback((key: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleCopyDiff = useCallback(async (key: string, diff: string) => {
    try {
      await navigator.clipboard.writeText(diff);
      setCopiedFile(key);
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
      copyResetTimeout.current = window.setTimeout(() => {
        setCopiedFile((current) => (current === key ? null : current));
      }, 2000);
    } catch (error) {
      console.error("Failed to copy diff", error);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const jumpToTop = useCallback(() => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const jumpToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, []);

  // Check if scroll buttons should be shown
  const checkScrollButtons = useCallback(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const shouldShow = container.scrollHeight > container.clientHeight + 100; // 100px threshold
      setShowScrollButtons(shouldShow);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
    checkScrollButtons();
  }, [messages, scrollToBottom, checkScrollButtons]);

  // Check scroll buttons on resize
  useEffect(() => {
    const handleResize = () => checkScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkScrollButtons]);

  // Prefer upstream messageType; provide minimal fallback for plan_update only
  const getMessageType = useCallback(
    (
      msg: UnifiedMessage,
    ):
      | "reasoning"
      | "tool_call"
      | "plan_update"
      | "exec_command"
      | "normal"
      | undefined => {
      const provided = (msg as any).messageType as any;
      if (provided) return provided;
      const eventType = (msg as any).eventType as string | undefined;
      if (eventType === "plan_update") return "plan_update";
      const title = ("title" in msg ? (msg as any).title : "") || "";
      if (title.includes("📋")) return "plan_update";
      const id = msg.id || "";
      if (id.includes("-plan-")) return "plan_update";
      const content = msg.content || "";
      if (
        (content.includes("✅") ||
          content.includes("🔄") ||
          content.includes("⏳")) &&
        content.includes("\n- ")
      ) {
        return "plan_update";
      }
      return undefined;
    },
    [],
  );

  // Helper to normalize message data - memoized to prevent re-calculations
  const normalizeMessage = useCallback(
    (msg: UnifiedMessage) => {
      let content = msg.content;
      let role: string;

      // Check if it's a codex message (has 'type' property)
      if ("type" in msg) {
        role =
          msg.type === "user"
            ? "user"
            : msg.type === "agent"
              ? "assistant"
              : msg.type === "approval"
                ? "approval"
                : "system";
      } else {
        // It's a chat message (has 'role' property)
        role = msg.role;
      }

      // Use provided messageType; fallback only for plan_update
      const messageType = getMessageType(msg);

      const ts: any = (msg as any).timestamp;
      const normalizedTimestamp =
        ts instanceof Date
          ? ts.getTime()
          : typeof ts === "number"
            ? ts
            : new Date().getTime();

      const baseMessage = {
        id: msg.id,
        role: role as "user" | "assistant" | "system" | "approval",
        content,
        // Preserve optional title for preview/header rendering
        title: "title" in msg ? (msg as any).title : undefined,
        timestamp: normalizedTimestamp,
        isStreaming: ("isStreaming" in msg ? msg.isStreaming : false) || false,
        model: "model" in msg ? (msg.model as string) : undefined,
        workingDirectory:
          "workingDirectory" in msg
            ? (msg.workingDirectory as string)
            : undefined,
        approvalRequest: (msg as any).approvalRequest || undefined,
        messageType,
        // Pass through raw event type from codex when present
        eventType: (msg as any).eventType || undefined,
        // Pass through structured plan payload when present
        plan: (msg as any).plan || undefined,
      };

      return baseMessage;
    },
    [getMessageType],
  );

  // Memoize normalized messages to avoid re-computation
  const normalizedMessages = useMemo(() => {
    return messages.map(normalizeMessage);
  }, [messages, normalizeMessage]);

  if (messages.length === 0) {
    return (
      <div
        className={`flex-1 min-h-0 flex items-center justify-center ${className}`}
      >
        <div className="text-center flex flex-col space-y-6 max-w-3xl px-4 w-full">
          <h2 className="text-2xl font-semibold">Welcome to Codexia</h2>
          <p className="text-sm text-muted-foreground">
            Powerful GUI/IDE for Codex CLI — start by sending your first
            message.
          </p>

          <Link to="/explore">
            <Button>Explore the community project or find a co-founder.</Button>
          </Link>

          <div className="grid grid-cols-2 gap-4 text-left">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card
                  key={i}
                  className="hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <CardHeader className="flex flex-row items-start gap-3">
                    <div className="rounded-lg p-2 bg-muted flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{f.title}</CardTitle>
                      <CardDescription>{f.description}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 min-w-0 relative ${className}`}
    >
      {/* Single Text Selection Menu for all messages */}
      <TextSelectionMenu />
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-2 py-2"
        onScroll={checkScrollButtons}
      >
        <div className="w-full max-w-full min-w-0">
          {normalizedMessages.map((normalizedMessage, index) => {
            const prev = index > 0 ? normalizedMessages[index - 1] : undefined;
            const next =
              index < normalizedMessages.length - 1
                ? normalizedMessages[index + 1]
                : undefined;

            // Group reasoning under the following assistant message and hide the standalone reasoning entry
            if (
              normalizedMessage.messageType === "reasoning" &&
              next?.role === "assistant"
            ) {
              return null;
            }

            // Do not render turn_diff as a full message; rendered separately below
            if ((normalizedMessage as any).eventType === "turn_diff") {
              return null;
            }

            const inlineReasoningContent =
              prev?.messageType === "reasoning" ? prev.content : undefined;

            return (
              <Message
                key={`${normalizedMessage.id}-${index}`}
                message={normalizedMessage}
                index={index}
                isLastMessage={index === messages.length - 1}
                selectedText={selectedText}
                previousMessage={prev}
                onApproval={onApproval}
                allMessages={normalizedMessages}
                inlineReasoningContent={inlineReasoningContent}
              />
            );
          })}

          {hasTurnDiffs && (
            <div className="mt-4 space-y-2">
              <div className="space-y-2">
                {turnDiffEntries.map((entry) => {
                  const expanded = !!expandedDiffs[entry.key];
                  const isRestoring = pendingRestores?.[entry.key] ?? false;
                  return (
                    <div
                      key={entry.key}
                      className="rounded-lg border border-border bg-background/90 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 px-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="truncate font-mono text-sm text-foreground"
                            title={entry.filePath}
                          >
                            {entry.filePath || "unknown file"}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {entry.entry.changeType}
                          </Badge>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              +{entry.additions}
                            </span>
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                              -{entry.deletions}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 hidden"
                            disabled={isRestoring}
                            onClick={async () => {
                              const success = await restoreDiff(entry.key, entry.entry);
                              if (success) {
                                setExpandedDiffs((prev) => {
                                  const next = { ...prev };
                                  delete next[entry.key];
                                  return next;
                                });
                              }
                            }}
                          >
                            {isRestoring ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Restoring
                              </span>
                            ) : (
                              "Restore"
                            )}
                          </Button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted"
                            onClick={() =>
                              handleCopyDiff(entry.key, entry.unified)
                            }
                            aria-label="Copy diff"
                          >
                            {copiedFile === entry.key ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted"
                            onClick={() => toggleDiff(entry.key)}
                            aria-label={expanded ? "Hide diff" : "Show diff"}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-border bg-muted/40">
                          <DiffViewer
                            unifiedDiff={entry.unified}
                            fileName={entry.filePath}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div>
              <div className="w-full min-w-0">
                <div className="rounded-lg border px-3 py-2 bg-white border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Jump Navigation Buttons */}
      {showScrollButtons && (
        <div className="absolute right-4 bottom-20 flex flex-col gap-1 z-10">
          <button
            onClick={jumpToTop}
            className="bg-white border border-gray-200 rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
            title="jumpToTop"
          >
            <ChevronUp className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={jumpToBottom}
            className="bg-white border border-gray-200 rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
            title="jumpToBottom"
          >
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}
