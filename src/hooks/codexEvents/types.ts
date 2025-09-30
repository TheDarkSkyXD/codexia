import type { MutableRefObject } from "react";
import type { CodexEvent } from "@/types/codex";
import type { ChatMessage } from "@/types/chat";
import type { StreamController, StreamControllerSink } from "@/utils/streamController";
import type { SnapshotState } from "./diffUtils";

type SessionMeta = { codexSessionId?: string; resumePath?: string };

type CommandInfo = { command: string[]; cwd: string };

export interface UseCodexEventsProps {
  sessionId: string;
  onStopStreaming?: () => void;
}

export interface CodexEventHandlerContext {
  sessionId: string;
  onStopStreaming?: () => void;
  addMessageToStore: (message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setResumeMeta: (sessionId: string, meta: SessionMeta) => void;
  autoApproveApprovals: boolean;
  streamController: MutableRefObject<StreamController>;
  currentStreamingMessageId: MutableRefObject<string | null>;
  currentReasoningMessageId: MutableRefObject<string | null>;
  reasoningBufferRef: MutableRefObject<string>;
  currentCommandMessageId: MutableRefObject<string | null>;
  currentCommandInfo: MutableRefObject<CommandInfo | null>;
  lastTurnDiffRef: MutableRefObject<string | null>;
  currentCommandSnapshot: MutableRefObject<SnapshotState | null>;
  currentPatchSnapshot: MutableRefObject<SnapshotState | null>;
  createStreamSink: (messageId: string) => StreamControllerSink;
}

export type CodexEventHandler = (event: CodexEvent, context: CodexEventHandlerContext) => void;
