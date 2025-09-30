import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { generateUniqueId } from "@/utils/genUniqueId";
import type { ChatMessage } from "@/types/chat";
import type { CodexEventHandler } from "./types";
import { useEphemeralStore } from "@/stores/EphemeralStore";

const handleSessionConfigured: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "session_configured") {
    return;
  }
  const { sessionId, setResumeMeta } = context;
  const backendSessionId = event.msg.session_id;
  if (!backendSessionId) {
    return;
  }

  setResumeMeta(sessionId, { codexSessionId: backendSessionId });
  invoke<string | null>("find_rollout_path_for_session", { sessionUuid: backendSessionId })
    .then((path) => {
      if (path) {
        setResumeMeta(sessionId, { resumePath: path });
      }
    })
    .catch(() => {});
};

const handleTaskStarted: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "task_started") {
    return;
  }
  const {
    sessionId,
    setSessionLoading,
    streamController,
    currentStreamingMessageId,
    currentReasoningMessageId,
    reasoningBufferRef,
    currentCommandSnapshot,
    currentPatchSnapshot,
  } = context;

  setSessionLoading(sessionId, true);
  streamController.current.clearAll();
  currentStreamingMessageId.current = null;
  currentReasoningMessageId.current = null;
  reasoningBufferRef.current = "";
  if (currentCommandSnapshot) {
    currentCommandSnapshot.current = null;
  }
  if (currentPatchSnapshot) {
    currentPatchSnapshot.current = null;
  }
};

const handleTaskCompleted: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "task_complete" && event.msg.type !== "turn_complete") {
    return;
  }
  const {
    sessionId,
    setSessionLoading,
    streamController,
    currentStreamingMessageId,
    currentReasoningMessageId,
    reasoningBufferRef,
    updateMessage,
    currentCommandSnapshot,
    currentPatchSnapshot,
  } = context;

  setSessionLoading(sessionId, false);
  if (currentStreamingMessageId.current) {
    streamController.current.finalize(true);
    currentStreamingMessageId.current = null;
  }
  if (currentReasoningMessageId.current) {
    updateMessage(sessionId, currentReasoningMessageId.current, { isStreaming: false });
    currentReasoningMessageId.current = null;
  }
  reasoningBufferRef.current = "";
  if (currentCommandSnapshot) {
    currentCommandSnapshot.current = null;
  }
  if (currentPatchSnapshot) {
    currentPatchSnapshot.current = null;
  }
};

const handleError: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "error") {
    return;
  }
  const {
    sessionId,
    setSessionLoading,
    currentStreamingMessageId,
    currentReasoningMessageId,
    streamController,
    reasoningBufferRef,
    updateMessage,
    addMessageToStore,
  } = context;

  if (currentStreamingMessageId.current) {
    streamController.current.finalize(true);
    currentStreamingMessageId.current = null;
  }
  if (currentReasoningMessageId.current) {
    updateMessage(sessionId, currentReasoningMessageId.current, { isStreaming: false });
    currentReasoningMessageId.current = null;
  }
  reasoningBufferRef.current = "";

  const errorMessage: ChatMessage = {
    id: `${sessionId}-error-${generateUniqueId()}`,
    role: "system",
    content: `Error: ${event.msg.message}`,
    timestamp: new Date().getTime(),
    eventType: event.msg.type,
  };
  addMessageToStore(errorMessage);
  setSessionLoading(sessionId, false);
};

const handleShutdownComplete: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "shutdown_complete") {
    return;
  }
  const {
    streamController,
    currentStreamingMessageId,
    currentReasoningMessageId,
    updateMessage,
    sessionId,
    reasoningBufferRef,
  } = context;

  streamController.current.clearAll();
  currentStreamingMessageId.current = null;
  if (currentReasoningMessageId.current) {
    updateMessage(sessionId, currentReasoningMessageId.current, { isStreaming: false });
    currentReasoningMessageId.current = null;
  }
  reasoningBufferRef.current = "";
};

const handleTurnAborted: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "turn_aborted") {
    return;
  }
  const {
    sessionId,
    addMessageToStore,
    setSessionLoading,
    streamController,
    currentStreamingMessageId,
    currentReasoningMessageId,
    updateMessage,
    reasoningBufferRef,
    currentCommandMessageId,
    currentCommandInfo,
    onStopStreaming,
    currentCommandSnapshot,
    currentPatchSnapshot,
  } = context;

  const abortMessage: ChatMessage = {
    id: `${sessionId}-aborted-${generateUniqueId()}`,
    role: "system",
    title: "🛑 Turn Stopped",
    content: event.msg.reason ? `Reason: ${event.msg.reason}` : "The current turn has been aborted.",
    timestamp: new Date().getTime(),
    eventType: event.msg.type,
  };
  addMessageToStore(abortMessage);
  setSessionLoading(sessionId, false);

  if (currentStreamingMessageId.current) {
    streamController.current.finalize();
    currentStreamingMessageId.current = null;
  }

  if (currentReasoningMessageId.current) {
    updateMessage(sessionId, currentReasoningMessageId.current, { isStreaming: false });
    currentReasoningMessageId.current = null;
  }
  reasoningBufferRef.current = "";

  if (currentCommandMessageId.current) {
    currentCommandMessageId.current = null;
    currentCommandInfo.current = null;
  }

  if (currentCommandSnapshot) {
    currentCommandSnapshot.current = null;
  }
  if (currentPatchSnapshot) {
    currentPatchSnapshot.current = null;
  }

  if (onStopStreaming) {
    onStopStreaming();
  }
};

const handleTokenCount: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "token_count") {
    return;
  }
  const { sessionId } = context;
  const usage = event.msg.info?.total_token_usage;
  useEphemeralStore.getState().setSessionTokenUsage(sessionId, usage ?? undefined);
};

const handleStreamError: CodexEventHandler = (event) => {
  if (event.msg.type !== "stream_error") {
    return;
  }
  toast.error(event.msg.message);
};

const noopHandler: CodexEventHandler = () => {};

export const sessionHandlers: Record<string, CodexEventHandler> = {
  session_configured: handleSessionConfigured,
  task_started: handleTaskStarted,
  task_complete: handleTaskCompleted,
  turn_complete: handleTaskCompleted,
  shutdown_complete: handleShutdownComplete,
  background_event: noopHandler,
  error: handleError,
  turn_aborted: handleTurnAborted,
  token_count: handleTokenCount,
  stream_error: handleStreamError,
};
